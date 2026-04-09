# Structured-Value Boundary Standardization Spec

Status: spec for parallel implementation under `m-f20e`
Investigation artifact: `STRUCTURED-VALUE-BOUNDARY-SEMANTICS.md`
Integration target: `~/mlld/benchmarks` banking suite (b-6ea9)

This spec is the synchronous agreement. After it lands, the work decomposes into parallel tracks. No agent should improvise a boundary contract — every operation uses one of the named helpers below, and call sites compose helpers explicitly when they cross multiple boundaries.

## The boundary profiles

Every boundary OPERATION has one primary profile from the list below. Real call sites often compose two or three operations (e.g., `field` then `display`, or `identity` then `.keep`) — the migration rule classifies each site by its primary profile, not by claiming a single contract for all of its work. The profiles:

1. **plainData** — recursively materialize a value into plain JS data. Top-level and nested `StructuredValue` / `Variable` children are unwrapped. Arrays/objects are recursively descended. `ExpressionProvenance` is preserved on the resulting plain objects when requested. Special wrappers (`ShelfSlotRefValue`, `LoadContentResult`, etc.) are preserved unless explicitly unwrapped. **plainData is the LOW-LEVEL recursive unwrap primitive — it does NOT extract variables or evaluate AST inputs. For env-aware config materialization (the policy.build use case), see the `config` profile below.**

2. **config** — env-aware adapter that produces plain JS data from a value that may contain variable references or AST-like interpreter nodes. Walks AST-like inputs through the interpreter's evaluate path, extracts variables via `extractVariableValue(...)`, then routes the resulting raw data through `plainData` for recursive unwrap. **This is what the policy materializers actually do, and it's why the existing `materializePolicyConfigValue` family is async.** Splitting it from `plainData` keeps the low-level unwrap sync and env-free while giving config consumers a single named adapter. **Use for:** `@policy.build` inputs, `with { policy }` fragment resolution, any consumer that takes "raw mlld value of unknown shape" and needs "plain JS object with variables resolved."

3. **field** — wrapper-preserving field access. Routes through the canonical `accessFields(...)` helper. Preserves `.mx`, projection metadata on children, and provenance attachment. Async + env-aware because the underlying primitive handles array indices, wildcards, workspace accessors, and executable auto-execution. **Use for:** any code that reads a named field on a value. Replaces manual property access.

4. **identity** — identity-preserving capability access. Preserves `internal.isToolsCollection`, `toolCollection`, `capturedModuleEnv`, shelf slot live references, and similar identity-bearing wrappers. Survives parameter binding across modules. **Use for:** tool collections, captured envs, shelf refs — anything where shape alone is insufficient.

5. **display** — output/document-level rendering. Returns `{ text, descriptor }` matching `display-materialization`'s existing contract. **Use for:** `@output` value rendering, document-level emission. **NOT for shell or template interpolation** — that's `interpolate` below.

6. **interpolate** — template/shell interpolation with context-specific escaping. Returns a string. Routes through `interpolation.ts` helpers, NOT `display-materialization`, because the escaping rules differ. **Use for:** backtick template interpolation, `cmd`/`sh` block interpolation, raw concat.

7. **serialize** *(vocabulary only in T1 — no helper)* — serialization for module boundaries. Preserves only metadata explicitly intended to survive a module boundary. Handles executable wrappers, tool collections, captured envs. Import/export, executable capture, tool collection export, and MCP serialization are related but not unifiable until they're audited together. The vocabulary lets reviewers name the contract; the helper ships in a follow-up.

There are **six concrete helpers in T1** (`plainData`, `config`, `field`, `identity`, `display`, `interpolate`) plus **one vocabulary-only profile** (`serialize`). Earlier drafts had five concrete helpers; splitting `plainData` into the sync primitive vs the env-aware config adapter is GPT round-2 fix #1.

## API

Single helper module at `interpreter/utils/boundary.ts`. One named export per helper, profile is part of the call name (no enum flags — wrong choices must be visible at the call site and grep-able).

The helpers are NOT one-size-fits-all. Their signatures reflect what the underlying primitives actually require — sync vs async, env-aware or not, single return shape vs context-specific shape.

```typescript
import type { Environment } from '@interpreter/env/Environment';
import type {
  FieldAccessNode,
  FieldAccessOptions,
  FieldAccessResult
} from '@interpreter/utils/field-access';

export const boundary = {
  /**
   * LOW-LEVEL recursive unwrap.
   * Synchronous, env-free. Walks StructuredValue and Variable wrappers
   * recursively. Does NOT extract variables (variable.value access only,
   * no AST evaluation, no async resolution). Does NOT walk AST nodes.
   *
   * This is the primitive that boundary.config calls internally after
   * its env-aware extraction step. Direct callers of plainData are
   * those that already have a fully-extracted value and just need the
   * recursive unwrap — e.g., post-extraction normalization passes.
   *
   * Migration target: existing shallow `asData(...)` callers that walk
   * recursively by hand. NOT the migration target for the policy
   * materializers — those go to boundary.config.
   */
  plainData<T = unknown>(
    value: unknown,
    options?: {
      preserveProvenance?: boolean;     // default true
      unwrapSpecialWrappers?: boolean;  // default false
    }
  ): T;

  /**
   * ENV-AWARE config materialization.
   * Async because underlying extraction handles AST-like interpreter
   * inputs (matching the same class of predicate as the runtime's
   * existing AST-like checks) and async variable value resolution
   * (`extractVariableValue(...)`).
   *
   * Pipeline:
   *   1. If value is an AST-like interpreter node, evaluate it via interpreter
   *   2. If value is a Variable, extract via extractVariableValue
   *   3. If value is a StructuredValue object/array, take .data
   *   4. Recurse into nested arrays/objects, repeating 1-3
   *   5. Final pass through plainData(...) for the recursive unwrap
   *
   * This is what materializePolicyConfigValue / materializePolicySourceValue
   * and similar env-aware policy/config adapters already do. Those
   * policy-domain duplicates collapse into this one helper.
   *
   * Migration target: existing policy-domain env-aware materializers
   * such as materializePolicyConfigValue / materializePolicySourceValue.
   * Lower-level recursive helpers such as unwrapStructuredRecursively
   * and resolveNestedValue remain reusable primitives; they do not
   * migrate wholesale to config.
   */
  config<T = unknown>(
    value: unknown,
    env: Environment,
    options?: {
      preserveProvenance?: boolean;     // default true
      unwrapSpecialWrappers?: boolean;  // default false
      allowAstEvaluation?: boolean;     // default true
    }
  ): Promise<T>;

  /**
   * Wrapper-preserving field access.
   * Async + env-aware because the underlying accessFields(...) handles
   * array indices, wildcard projection, variable indices, workspace
   * accessors, executable auto-execution, and metadata propagation —
   * none of which can be sync or env-free.
   *
   * Accepts EITHER:
   *   - a pre-parsed FieldAccessNode[] (preferred — callers that
   *     already have AST segments pass them directly)
   *   - a string path that the helper parses into FieldAccessNode[]
   *     (convenience for migration sites that only have a literal
   *     field name)
   *
   * Routes through accessFields(...) from interpreter/utils/field-access.ts.
   */
  field<T = any>(
    value: unknown,
    path: string | FieldAccessNode[],
    env: Environment,
    options?: FieldAccessOptions
  ): Promise<T | FieldAccessResult>;

  /**
   * Identity-preserving capability access.
   * Synchronous — identity recovery is a metadata lookup, not an
   * evaluation.
   */
  identity<T = unknown>(value: unknown): T;

  /**
   * Display materialization for @output and document-level rendering.
   * Returns text + descriptor (matching display-materialization's
   * existing contract). NOT a one-size-fits-all string boundary —
   * shell/template interpolation is a different boundary, see
   * boundary.interpolate below.
   */
  display(value: unknown): { text: string; descriptor: unknown };

  /**
   * Template/shell interpolation boundary.
   * Context-specific escaping:
   *   - 'template' for backtick interpolation (mlld template semantics)
   *   - 'shell' for cmd/sh blocks (shell-quoting)
   *   - 'plain' for raw concat
   * Routes through interpolation.ts helpers, NOT display-materialization,
   * because the escaping rules differ.
   */
  interpolate(
    value: unknown,
    context: 'template' | 'shell' | 'plain'
  ): string;

  // serialize is a profile in the vocabulary but NOT shipped as a
  // unified helper in T1 — see "Serialize: deferred helper" below.
};
```

Implementation reuses existing primitives:
- `boundary.plainData` is the new sync recursive-unwrap core. New code, but small — walks StructuredValue/Variable wrappers without env. The four existing materializers DO NOT migrate to this directly; they migrate to `boundary.config` which calls `plainData` internally as its final pass.
- `boundary.config` wraps the policy-domain env-aware materializers such as `materializePolicyConfigValue` / `materializePolicySourceValue`. Async + env-aware. Internally: AST-like eval → variable extract → recursive plainData. Lower-level recursive helpers such as `unwrapStructuredRecursively` and `resolveNestedValue` remain reusable primitives that `plainData` / `display` may call internally as appropriate; they do not migrate wholesale to `config`.
- `boundary.field` wraps `accessFields(...)` from `interpreter/utils/field-access.ts`, with a string-path-to-FieldAccessNode parser for migration convenience
- `boundary.identity` wraps `resolveDirectToolCollection(...)` plus the captured-env recovery path from `parameter-factory.ts`
- `boundary.display` wraps `display-materialization` helpers (returns `{text, descriptor}`)
- `boundary.interpolate` wraps `interpolation.ts` helpers with explicit context

The point of `boundary.*` is not new logic — it is one named entry point per profile so callers can't improvise.

### Serialize: deferred helper

The `serialize` profile is part of the vocabulary, but a unified `boundary.serialize(...)` helper is **not in T1**. The reason: import/export, executable capture, tool collection export, and MCP serialization are related but not identical contracts. Unifying them prematurely risks the same "one helper, multiple meanings" trap that created this bug class.

For T1: keep existing serialization paths in place. Add `serialize` to the vocabulary in this spec so reviewers can name it. Migrate to a unified helper in a follow-up after the four serialization sites have been audited and their shared contract is known.

### Profiles compose; consumers are not single-profile

A consumer is rarely "exactly one profile" — most real call sites compose. Examples:

- `field` then `display` — read a field, then render the result for output
- `identity` then `.keep` — preserve identity across an mlld→mlld hop, then preserve through an embedded-language boundary
- `field` then `plainData` — read a field, then materialize the result for a config consumer

The migration rule below classifies the **primary profile** of each call site (the one that determines the dominant contract), with explicit composition allowed and encouraged. The dev assertion checks each helper's contract independently, so composed calls compose checks too.

## Escape hatches: `.keep`, `.keepStructured`, `preserveStructuredArgs`

These are NOT a sixth profile. They are the **embedded-language boundary parallels** of `boundary.identity`. They protect wrapper identity (labels, factsources, projection metadata, internal flags) at boundary types where the runtime cannot insert helper calls.

Embedded-language boundaries include any language block where mlld values cross into a non-mlld evaluator: `js {...}`, `py {...}`, `sh {...}`, `node {...}`, and any future embedded language. All of them auto-unwrap by default — the receiving code sees plain data, not StructuredValue wrappers.

| Escape hatch | Boundary type | Conceptual equivalent |
|---|---|---|
| `value.keep` / `value.keepStructured` | mlld → embedded language (per call site) | `boundary.identity(value)` for the next embedded-language boundary |
| `preserveStructuredArgs: true` on exe | mlld → embedded language (per exe definition) | `boundary.identity(value)` applied to all params of this exe |

The runtime CAN insert helper calls at mlld→mlld boundaries — that's what `boundary.*` is for. It CANNOT at mlld→embedded-language boundaries because the receiver is foreign code that auto-unwraps by default. `.keep` is the per-value opt-out that the embedded-language interop layer respects.

### Relationship to the boundary profiles

- `boundary.identity(value)` and `value.keep` express the same intent ("preserve the wrapper") at different boundary types. A consumer that needs identity preservation across BOTH an mlld function call AND a downstream embedded-language boundary uses both: `boundary.identity(value).keep`.
- `boundary.plainData(value.keep)` is a contradiction — the caller asked to preserve the wrapper AND materialize plain data. The dev assertion must flag this combination.
- `boundary.field(value.keep, 'foo')` is fine — `field` is wrapper-preserving by default; `.keep` is a no-op here but harmless.
- `boundary.display(value.keep)` and `boundary.interpolate(value.keep, ctx)` are both fine — `.keep` is dropped because display/interpolate produce text-shaped output regardless of wrapper preservation. The dev assertion should not flag these; it's the documented "display/interpolate strips wrapper" behavior.
- The `serialize` profile (vocabulary in T1, helper deferred) is the eventual boundary for `.keep` metadata that needs to survive a module export. Until that helper exists, the existing serialization paths handle this case-by-case.

### Migration rule for current `.keep` usage

| Existing `.keep` usage | Migration |
|---|---|
| `.keep` immediately followed by an embedded-language block (`js`, `py`, `sh`, `node`) | Keep as-is — canonical use |
| `.keep` used to preserve wrapper across an mlld function call boundary | Replace with `boundary.identity(value)` at the receiving site, drop the `.keep` |
| `.keep` followed by `.data` access in an embedded-language block to read raw data | Drop the `.keep` — the auto-unwrap was what you wanted; or, if you needed `.mx`, keep the `.keep` and route through `.mx` |
| `preserveStructuredArgs: true` on exe | Keep as-is — exe-definition-level escape hatch is the right shape |

### Dev assertion additions

The dev assertion treats `.keep` as a typed marker on the value. It fires when:

1. A value carrying `.keep` reaches `boundary.plainData(...)` — **warning, not error**. `plainData` is non-destructive; the original wrapped value still exists, the caller is just asking for a materialized view alongside it. The real bug condition (using the materialized result as if it still had `.keep` semantics) requires aliasing analysis the assertion can't do at the call site, so we surface the suspicious pattern as a warning.
2. A value carrying `.keep` reaches an embedded-language block (`js`/`py`/`sh`/`node`) that doesn't access `.mx` or `.data` — `.keep` was unnecessary. **Warning.**
3. A value carrying `.keep` is dropped without ever reaching a boundary that respects it — the directive was a no-op. **Warning.**

All three are warnings in dev mode. None are errors. The error conditions for the dev assertion are profile-contract violations, not escape-hatch interactions.

### What `.keep` does NOT do after migration

- It does NOT replace `boundary.identity(...)` for mlld→mlld boundaries. Code that uses `.keep` to thread a value through an mlld function call should migrate.
- It does NOT survive a `boundary.plainData(...)` call. If you want both the wrapper AND a plain-data view, that's two separate values via two separate calls.
- It does NOT automatically compose with serialization — the `serialize` profile (when it lands as a helper) will have its own metadata-survivability rules; `.keep` is an embedded-language interop directive, not a serialization directive.

## Object spread semantics (decision)

**Object spread `{ ...value }` is a `boundary.plainData` boundary.** Spreading materializes — the result is a fresh plain object with no wrapper, no labels, no projection metadata. This matches existing observable behavior (the `.keep` workaround that surfaced m-d57b worked precisely because spread strips wrappers) and matches caller intuition (a `{ ...obj }` literal in any language produces a fresh copy).

Implications:
- `boundary.plainData(value)` and `{ ...value }` are interchangeable for object literals. Spread is the syntactic sugar; the helper is the explicit form.
- If you want wrapper preservation, use `boundary.identity(value)` or access fields via `boundary.field(value, 'path')` instead of spreading.
- The dev assertion treats spread the same as `boundary.plainData`: structured children must not survive.

**This is a language design decision masquerading as a runtime contract.** It needs Adam's explicit confirmation in code review before T1 merges. If Adam disagrees and wants spread to be wrapper-preserving (i.e., spread is `boundary.identity` semantics), the spec changes here and T5 becomes a real semantic migration, not a documentation pass.

## The dev assertion

Every helper runs a contract check on its result in dev mode:

```typescript
class BoundaryViolation extends MlldInterpreterError {
  constructor(
    public readonly profile: BoundaryProfile,
    public readonly violation:
      | 'structured_children_remain'
      | 'identity_lost'
      | 'wrong_field_path'
      | 'wrapper_survived_serialize',
    public readonly siteHint?: string,
    public readonly value?: unknown
  );
}
```

Triggers:

| Profile | Violation when |
|---|---|
| `plainData` | result still contains `StructuredValue` or `Variable` children |
| `config` | result still contains `StructuredValue` / `Variable` children OR an unevaluated AST-like value that matches the interpreter's existing AST-like predicate — `config`'s contract is "fully extracted plain data." Ordinary plain objects that merely contain a `type` field are NOT violations |
| `field` | NONE — `field` correctness is enforced by the type system (callers passing `string \| FieldAccessNode[]` + env). Manual property access on wrapped values is a lint/grep concern (T6 audit), not a runtime assertion |
| `identity` | result lacks the identity flag the input had (`isToolsCollection`, `capturedModuleEnv`, shelf slot ref, etc.) |
| `display` | result is missing `text` or `descriptor` |
| `interpolate` | result is not a string. Context-specific escaping correctness is NOT a runtime assertion — `interpolate`'s implementation owns escaping internally; bypass detection belongs in lint/audit/code review (T6 territory), not in `BoundaryViolation`. |
| `serialize` (vocabulary only in T1) | n/a until the helper exists |

Dev mode is enabled when `NODE_ENV !== 'production'` OR `MLLD_STRICT_BOUNDARIES=1`. Production mode logs the violation as a structured trace event but does not throw, so existing scripts don't break mid-migration.

The assertion is the noisy-failure mechanism that converts the entire bug class from "silent drop" to "loud crash in dev." It is the most important deliverable of this spec — every other piece can ship incrementally; the assertion must land in the first PR.

## Migration rule

Every existing call site fits into one of these patterns. Sites that combine multiple operations (e.g., field access then materialization) compose helpers explicitly:

| Existing pattern | New call | Notes |
|---|---|---|
| `asData(value)` for top-level scalar/array, no recursion | Keep as-is, mark with `// boundary: intentional shallow asData` | Audited during P5 |
| `asData(value)` followed by manual recursion (no variable extraction, no AST eval) | `boundary.plainData(value)` | Sync recursive unwrap, env-free |
| `asData(value)` followed by manual recursion + variable extraction or AST evaluation | `boundary.config(value, env)` | Async, env-aware. Use whenever the materialization needs to walk Variables or AST nodes |
| Manual `value.field` / `value['field']` on a wrapped value | `boundary.field(value, 'field', env)` | Routes through `accessFields`. Async + env-aware |
| `resolveDirectToolCollection` / capture-env recovery | `boundary.identity(value)` | Preserves identity flags |
| `materializePolicyConfigValue` / `materializePolicySourceValue` / similar policy-domain env-aware materializers | `boundary.config(value, env)` | Policy/config materializers collapse into this single env-aware helper |
| `unwrapStructuredRecursively` / `resolveNestedValue` | Reclassify per caller: usually `boundary.plainData(...)`, `boundary.display(...)`, or internal helper reuse | These are lower-level recursive primitives, not automatically `config` |
| `@output` rendering / document-level display | `boundary.display(value)` | Returns `{text, descriptor}` |
| Template/shell interpolation | `boundary.interpolate(value, context)` | Returns `string`; context is `'template'`, `'shell'`, or `'plain'` |
| Import/export serialization handlers | Keep current paths (deferred — `serialize` is vocabulary in T1, not a helper) | Audited and unified in a follow-up after T1 ships |

Migration is mechanical. Reviewer rule: any PR that introduces a new ad-hoc materializer or manual property-walk is rejected — use the helper.

## Regression matrix

One test runner generates the full matrix:

```typescript
// interpreter/utils/__tests__/boundary-matrix.test.ts

// 'serialize' is in the vocabulary but not yet a helper. Matrix covers
// the six concrete helpers shipped in T1. Each helper has a distinct
// signature, so the runner cannot use boundary[profile](value)
// uniformly — it dispatches per profile via invokeForProfile.
const PROFILES = [
  'plainData',
  'config',
  'field',
  'identity',
  'display',
  'interpolate'
] as const;

const ORIGINS = [
  'script-literal',
  'let-bound',
  'parameter-bound',
  'exe-returned',
  'imported',
  'field-access-result',
  'spread-clone',
  'embedded-language-shadow-return'
] as const;

const SHAPES = [
  'scalar',
  'array',
  'object',
  'nested-array-in-object',
  'nested-object-in-array',
  'projection-bearing-record',
  'tool-collection'
] as const;

// interpolate has a context dimension; other profiles don't
const INTERPOLATE_CONTEXTS = ['template', 'shell', 'plain'] as const;

/**
 * Per-profile dispatch — each helper has its own signature so we cannot
 * call boundary[profile](value) uniformly. plainData/identity are sync,
 * config/field are async + env-aware, display/interpolate produce
 * shape-specific output.
 */
async function invokeForProfile(
  profile: typeof PROFILES[number],
  value: unknown,
  env: Environment,
  interpolateContext?: typeof INTERPOLATE_CONTEXTS[number]
) {
  switch (profile) {
    case 'plainData':
      return boundary.plainData(value);
    case 'config':
      return await boundary.config(value, env);
    case 'field':
      // Matrix uses a known fixture field name; real callers pass
      // FieldAccessNode[] for production use
      return await boundary.field(value, 'sample', env);
    case 'identity':
      return boundary.identity(value);
    case 'display':
      return boundary.display(value);
    case 'interpolate':
      return boundary.interpolate(value, interpolateContext ?? 'template');
  }
}

describe.each(PROFILES)('boundary.%s', (profile) => {
  describe.each(ORIGINS)('origin: %s', (origin) => {
    describe.each(SHAPES)('shape: %s', (shape) => {
      it('honors profile contract', async () => {
        const env = await produceEnv();
        const value = await produceValue(origin, shape, env);
        const result = await invokeForProfile(profile, value, env);
        expectProfileContract(profile, result, { origin, shape });
      });
    });
  });
});

// interpolate gets an additional context dimension
describe.each(INTERPOLATE_CONTEXTS)('boundary.interpolate × context: %s', (context) => {
  describe.each(ORIGINS)('origin: %s', (origin) => {
    describe.each(SHAPES)('shape: %s', (shape) => {
      it('honors interpolate contract', async () => {
        const env = await produceEnv();
        const value = await produceValue(origin, shape, env);
        const result = await invokeForProfile('interpolate', value, env, context);
        expect(typeof result).toBe('string');
        expectInterpolateEscaping(result, context);
      });
    });
  });
});
```

**Case counts:** 6 profiles × 8 origins × 7 shapes = **336 baseline cases**, plus interpolate's context dimension (3 contexts × 8 origins × 7 shapes = **168 additional interpolate cases**), for **~504 total cases**, all generated from one matrix definition. Adding a profile or origin is one row, not 504 hand-written tests.

The per-profile dispatch in `invokeForProfile` is load-bearing — each helper has its own signature, so the runner cannot call `boundary[profile](value)` uniformly. Track T1 must export `Environment`-typed test helpers so T7 can produce realistic env fixtures.

`expectProfileContract` checks the profile-specific invariants documented above.

### Escape hatch interaction matrix

A separate, smaller matrix tests `.keep` / `.keepStructured` / `preserveStructuredArgs` interactions with each profile:

```typescript
// Each row tests a (profile × escape-hatch-state) combination
const ESCAPE_HATCH_STATES = [
  'no-keep',                  // baseline
  'keep-applied',             // value.keep at call site
  'keepStructured-applied',   // value.keepStructured (alias)
  'preserveStructuredArgs',   // exe declared with preserveStructuredArgs: true
] as const;

describe.each(PROFILES)('boundary.%s × escape hatches', (profile) => {
  describe.each(ESCAPE_HATCH_STATES)('state: %s', (state) => {
    it('honors escape hatch contract', async () => {
      const env = await produceEnv();
      const value = await produceValueWithEscapeHatchState(state, env);
      // For plainData + keep-applied: expect dev assertion to fire (contradiction)
      // For config + keep-applied: same contradiction, but through the env-aware adapter
      // For field + keep-applied: expect wrapper preserved (no-op, harmless)
      // For display + keep-applied: expect {text, descriptor} result (.keep dropped silently)
      // For identity + keep-applied: expect identity preserved AND wrapper preserved
      // For interpolate + keep-applied: expect string result in the chosen interpolation context
      const result = await invokeForProfile(
        profile,
        value,
        env,
        profile === 'interpolate' ? 'template' : undefined
      );
      expectEscapeHatchContract(profile, state, result);
    });
  });
});
```

6 concrete profiles × 4 states = 24 additional baseline cases. If we also run non-default interpolate contexts here, add those as explicit context variants rather than pretending the helper signatures are uniform. Validates the escape-hatch interaction rules in the spec.

## Integration target

**Banking UT3** is the canonical live integration test. It exercises all six concrete profiles in one dispatch path:

| Profile | UT3 site |
|---|---|
| `config` | `@policy.build(@decision.authorizations, @agent.toolsCollection, { basePolicy: @agent.basePolicy })` — env-aware materialization of the basePolicy fragment |
| `plainData` | post-extraction normalization inside `@policy.build`'s pipeline (the recursive unwrap final pass) |
| `field` | `@agent.basePolicy`, `@agent.toolsCollection`, `@decision.authorizations` access |
| `identity` | `@agent.toolsCollection` parameter-bound across rig module boundary |
| `display` | `@output @result to ...` writes from rig orchestration debug paths |
| `interpolate` | `@executePrompt(...)` template interpolation, planner prompt assembly |

`serialize` is in the vocabulary but not exercised as a helper in T1 (deferred). Banking domain modules are imported via the existing import/export paths and remain on those paths until the `serialize` follow-up.

Acceptance criterion for the migration: **banking UT3 reaches the execute @claude call cleanly under defended mode, with no boundary violations in the trace.** UT1 must still pass. UT4, UT6, UT14 are additional surface.

`~/mlld/benchmarks/llm/agents/banking.mld` + the rig orchestration are the test fixture. Run via:

```bash
cd ~/mlld/benchmarks
MLLD_STRICT_BOUNDARIES=1 uv run python3 src/run.py -s banking -d defended -t user_task_3 --debug
```

Strict mode forces every boundary violation to throw, making misclassified migrations immediately visible.

## Track assignments

Ten independent tracks. Spec doc is the only synchronous artifact; everything below ships in parallel after the spec lands.

| Track | Owner | Files | Done when |
|---|---|---|---|
| T1: helper module + assertion | GPT | `interpreter/utils/boundary.ts`, `interpreter/utils/__tests__/boundary-matrix.test.ts` | Six concrete helpers exist (`plainData`, `config`, `field`, `identity`, `display`, `interpolate`); `serialize` is in the vocabulary but deferred. Dev assertion fires in dev mode for the contract violations listed in "The dev assertion" section. Matrix runner runs (cases can be empty initially). Object spread → `plainData` semantics confirmed by Adam in code review before merge. |
| T2: policy domain migration (P1) | GPT | `interpreter/env/builtins/policy.ts`, `interpreter/policy/authorization-compiler.ts`, `interpreter/eval/exec/policy-fragment.ts`, `core/policy/label-flow.ts`, `core/policy/guards.ts` | Policy-domain env-aware materializers such as `materializePolicyConfigValue` and `materializePolicySourceValue` collapse into `boundary.config`. Field access uses `boundary.field`. Lower-level recursive helpers like `unwrapStructuredRecursively` and `resolveNestedValue` are reclassified per caller rather than blindly moved under T2. Note: m-5b1c (rule-flow substrate exemption) is a related but DIFFERENT runtime mechanism — label projection from a tool list onto a host operation — and is NOT addressed by this track. T2 only ensures these files consume policy values consistently; m-5b1c needs its own fix in the operation-label-computation code path. |
| T3: output migration (P2) | GPT | `interpreter/eval/output.ts` | Manual property access replaced with `boundary.field` |
| T4: identity migration (P4) | GPT | `interpreter/eval/var/tool-scope.ts`, `interpreter/utils/parameter-factory.ts`, `interpreter/env/executors/call-mcp-config.ts`, import/export helpers | Tool collections + captured envs route through `boundary.identity` |
| T5: object spread classification (P3) | GPT | `interpreter/eval/data-values/CollectionEvaluator.ts` | Spread is documented as `boundary.plainData` semantics, enforced |
| T6: shallow asData audit (P5) | GPT | All remaining `asData(...)` call sites in `interpreter/` | Each is migrated OR marked `// boundary: intentional shallow asData` |
| T6b: escape hatch audit | GPT | All `.keep` / `.keepStructured` / `preserveStructuredArgs` call sites | Each is classified per the migration rule above; non-embedded-language uses migrated to `boundary.identity` |
| T7: regression matrix fixtures | Claude (rig) | `interpreter/utils/__tests__/boundary-matrix.test.ts` fixtures + `produceValue` helpers | All baseline 336 cases plus the additional 168 interpolate-context cases produce concrete values; expectations checked. **Heaviest track in this list** — `produceValue(origin, shape)` for cells like "structured array of nested structured objects with projection metadata via parameter binding from exe return with tool collection identity" requires building actual fixtures, not stubs. Size accordingly; do not undercost relative to T8. |
| T8: rig integration test driver | Claude (rig) | `~/mlld/benchmarks` banking smoke + `~/mlld/rig/tests/` | Banking UT3 + UT1 + UT4 + UT6 + UT14 run under `MLLD_STRICT_BOUNDARIES=1` and the runtime path is clean |
| T9: exec-invocation hotspot | GPT | `interpreter/eval/exec-invocation.ts` (60 wrapper/provenance touches — #1 hotspot in the audit) | Every wrapper/provenance touch routes through a `boundary.*` helper or carries an explicit `// boundary: intentional` comment with rationale |
| T10: shelf runtime hotspot | GPT | `interpreter/shelf/runtime.ts` (32 wrapper/provenance touches — #2 hotspot, strongly wrapper-aware subsystem) | All wrapper-preserving paths route through `boundary.field` / `boundary.identity`. Shelf is the canonical wrapper-aware consumer; this track validates that the helpers serve its needs without forcing materialization |

Tracks T2–T5 can land independently of each other once T1 lands. T6 / T6b are sweep audits that should run AFTER T2–T5 + T9 + T10 land — they catch remaining sites the named tracks didn't touch and risk merge conflicts if they run in parallel with the named migrations. T7 + T8 run continuously as integration verification.

### Coordination: file ownership

Some tracks reach into adjacent code areas. Define disjoint file ownership before dispatch:

- **T2 (policy)** owns: `interpreter/env/builtins/policy.ts`, `interpreter/policy/authorization-compiler.ts`, `interpreter/eval/exec/policy-fragment.ts`, `core/policy/label-flow.ts`, `core/policy/guards.ts`
- **T4 (identity)** owns: `interpreter/eval/var/tool-scope.ts`, `interpreter/utils/parameter-factory.ts`, `interpreter/env/executors/call-mcp-config.ts`, **and** the import/export tool-collection serialization layer in `interpreter/eval/import/`
- **T9 (exec-invocation)** owns: `interpreter/eval/exec-invocation.ts` exclusively
- **T10 (shelf)** owns: `interpreter/shelf/runtime.ts` and `interpreter/shelf/*` exclusively
- **T6 (asData audit)** runs LAST, after T2/T3/T4/T5/T9/T10 — picks up whatever those tracks didn't touch
- **T6b (escape hatch audit)** also runs LAST, same reason

If a track needs to touch a file owned by another track, it stops and coordinates rather than improvising.

## Completion criteria

The standardization is complete when ALL of these are true:

1. `interpreter/utils/boundary.ts` exists with all six concrete helpers (`plainData`, `config`, `field`, `identity`, `display`, `interpolate`) + dev assertion. (`serialize` is in the vocabulary but deferred to a follow-up.)
2. The baseline 336-case regression matrix and the additional 168 interpolate-context cases are all green
3. Every site listed in `STRUCTURED-VALUE-BOUNDARY-SEMANTICS.md` Priority 1–5 is migrated or explicitly marked intentional
4. `MLLD_STRICT_BOUNDARIES=1 npm test` produces zero `BoundaryViolation` errors
5. Banking UT3 reaches the execute @claude call cleanly under defended mode + strict boundaries
6. UT1 still passes
7. Banking UT3 produces zero `BoundaryViolation` events under strict mode. (Note: this does NOT mean UT3 PASSes the AgentDojo utility check — UT3 may still fail at the m-5b1c runtime gap, which is a separate non-boundary concern. The boundary work is complete when boundary violations are zero, regardless of m-5b1c's status.)

When all seven hold, `m-f20e` closes and the rig framework is the proof-of-concept for the boundary helpers. m-5b1c remains a separate ticket and is expected to land independently.

## What this spec does NOT decide

- The exact internal implementation of each helper (each track owns its own implementation; spec only constrains the API + the contract the assertion enforces)
- Whether `boundary.identity` should also expose `identity.scope` / `identity.envHandle` accessors (deferred — first land the unified identity helper, extract sub-accessors if needed)
- Whether to deprecate the existing `materializePolicyConfigValue` etc. names or keep them as compatibility wrappers (track T2 owner decides; preference is to delete and redirect imports)
- Whether the rig framework needs its own boundary-style helper exports for downstream consumers (deferred — first ship the runtime; reassess after rig stabilizes)

## Decisions made in the spec body (no longer open)

These were open questions in earlier drafts; the spec body now states them as facts:

- **Dotted paths in `boundary.field`**: supported. `boundary.field(v, 'a.b.c')` walks the path via `accessFields(...)`. Decided because it cleanly subsumes most of `output.ts` field access without forcing callers to chain three calls.
- **Object spread semantics**: spread `{ ...value }` is `boundary.plainData`. See "Object spread semantics" section above. **Needs Adam's confirmation in code review** — the only language design call in this spec.

## Open questions

Do not block parallel work but should be answered before T1 merges:

1. Should the dev assertion include a stack-trace `siteHint`, or rely on the test name? Recommendation: include siteHint via `Error.captureStackTrace` for non-test callers.
2. When the `boundary.serialize` helper eventually ships (in a follow-up after T1), should it be symmetric with `boundary.deserialize`? Recommendation: yes, but defer the question until after the four serialization sites have been audited and their shared contract is known.
3. Should `.keep` get a deprecation warning in dev mode for non-embedded-language uses, or just rely on the migration audit (T6b) to find them? Recommendation: silent migration during T6b, then enable a dev-mode warning in a follow-up PR after the audit is complete. Avoids alert fatigue while migration is in flight.
4. Should `boundary.identity(value).keep` be sugar for "preserve identity across both mlld and embedded-language boundaries," or should callers explicitly chain? Recommendation: explicit chain — composition is clearer than implicit fusion, and `boundary.identity(value).keep` reads naturally already.

## Graceful degradation

If T1 slips for any reason, the **vocabulary section alone has independent value as a docs-only PR**. Once the team can say "this consumer needs `identity`, why is it using `plainData`?" or "this is a `config` site, not `plainData`" in code review, the bleeding stops without any code moving. The seven named profiles (six concrete + serialize vocabulary) + the migration rule table + the escape-hatch interaction rules form a shared review vocabulary that prevents new instances of the bug class even before the helpers exist.

The fast path is the parallel-tracks plan above. The slow path is the docs-only-first plan. Both end in the same place; the slow path just delays integration verification until the helpers land.

---

**Bottom line**: this spec defines a single boundary helper module, a noisy-failure assertion, a mechanical migration rule, a generated regression matrix, and a live integration test. After it lands, ten parallel tracks can ship the migration in days. Banking UT3 is the proof. The investigation doc (`STRUCTURED-VALUE-BOUNDARY-SEMANTICS.md`) is the rationale; this doc is the action.
