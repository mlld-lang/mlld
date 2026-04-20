# Dossier: Var-Label Grammar + `var tools` Archaeology

**Purpose:** Document the var-label grammar surface and do git archaeology on the `var tools` addition — the closest structural precedent for `var session`. Provide an explicit grammar extension checklist.

---

## Executive Summary

`var session` extends the existing `var <label>` family (peer with `var tools`, `var secret`, `var untrusted`, `var pii`). The grammar surface is minimal: add `session` to the label alphabet in `grammar/patterns/security.peggy:39`, then dispatch on `isSessionLabel` in the interpreter to handle the RHS as a JSON-shaped object type schema (field: TypeExpr pairs).

**`var tools` (commit 2681c2d5a, 2026-01-23) provides the closest structural precedent**: it introduced label-driven RHS parsing that checks the directive's `meta.isToolsCollection` flag and routes to specialized collection validation. The session label reuses this dispatch pattern, routing instead to a schema validator accepting primitive types, `@record` references, optional suffixes, and array/object forms, emitting a `meta.isSessionLabel = true` flag for interpreter branching.

---

## Current Var-Label Alphabet

| Label | Category | RHS Parse | Runtime Dispatch |
|---|---|---|---|
| `secret` | Sensitivity | Generic value | Label propagation only |
| `untrusted` | Trust | Generic value | Label propagation + `defaults.unlabeled` rules |
| `pii` | Sensitivity | Generic value | Label propagation + policy rules |
| `sensitive` | Sensitivity | Generic value | Label propagation |
| `trusted` | Trust (inverse) | Generic value | Label propagation |
| `known` / `known:internal` | Attestation | Generic value | Proof-minting on `=> record` |
| `influenced` | Taint (auto) | N/A | Auto-applied by rules |
| `fact:*` | Proof | N/A | Minted by `=> record @name` coercion |
| `src:*` | Source | N/A | Auto-applied on load/import/command |
| `tools` | Role-shape | **JSON object** ✓ | `isToolsCollection` → collection validator |
| **`session`** (new) | State container | **Schema object** | `isSessionLabel` → schema validator |

---

## Where Labels Are Enumerated

`grammar/patterns/security.peggy:37–42`

```peggy
DataLabelIdentifier
  = label:BaseIdentifier suffix:(':' BaseIdentifier)? &{
      const reserved = ['module', 'static', 'live', 'cached', 'local', 'foreach', 'pipeline', 'with', 'from', 'as', 'tools'];
      return !reserved.includes(label.toLowerCase());
    } { return suffix ? first + ':' + suffix[1] : first; }
```

**Key:** `tools` is marked **reserved** to prevent use as a generic data label — treated as a special keyword. Same pattern for `session`.

---

## Var Directive Grammar with Label Handling

`grammar/directives/var.peggy:8–15`

```peggy
SlashVar "var directive"
  = DirectiveContext VarKeyword 
    toolsSegment:(HWS "tools")? 
    labelsSegment:(HWS DataLabelList HWS &"@")? 
    _ "@" id:BaseIdentifier optionalMarker:("?" { return true; })? _ "=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      
      let tail = ending.tail;
      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      const isToolsCollection = !!toolsSegment;
      // TO EXTEND: ADD sessionSegment:(HWS "session")? and const isSessionLabel = !!sessionSegment;
```

AST metadata flag set at `grammar/directives/var.peggy:252–256`:

```peggy
if (labelInfo) {
  metaInfo.securityLabels = labelInfo.labels;
  values.securityLabels = labelInfo.labels;
}

if (isToolsCollection) {
  metaInfo.isToolsCollection = true;
}
// ADD HERE:
// if (isSessionLabel) {
//   metaInfo.isSessionLabel = true;
// }
```

**AST output:** `DirectiveNode` with:
- `kind: 'var'`
- `subtype: 'var'` (unified)
- `meta: { isToolsCollection?: boolean, isSessionLabel?: boolean, securityLabels?: string[], ... }`
- `values: { identifier: [...], value: [...], securityLabels?: [...] }`

---

## Label-to-Runtime Dispatch

**Primary dispatch:** `interpreter/eval/var.ts`

Extract flags, pass to RHS dispatcher:

```typescript
export async function prepareVarAssignment(
  directive: DirectiveNode,
  env: Environment,
  context?: EvaluationContext
): Promise<VarAssignmentResult> {
  const identifierNodes = directive.values?.identifier;
  const identifier = extractIdentifier(identifierNodes);
  const securityLabels = (directive.meta?.securityLabels ?? directive.values?.securityLabels) as DataLabel[] | undefined;
  const isToolsCollection = directive.meta?.isToolsCollection === true;
  // ADD: const isSessionLabel = directive.meta?.isSessionLabel === true;
  
  const rhsDispatcher = createRhsDispatcher({
    directive, env,
    isToolsCollection,
    // ADD: isSessionLabel,
  });
  
  const evaluationResult = await rhsDispatcher.evaluate(valueNode);
  // ...
}
```

**Secondary dispatch:** `interpreter/eval/var/rhs-dispatcher.ts:69–81`

```typescript
export interface RhsDispatcherDependencies {
  isToolsCollection: boolean;
  // ADD: isSessionLabel?: boolean;
}

const evaluate = async (valueNode: unknown): Promise<RhsEvaluationResult> => {
  if (isToolsCollection) {
    const normalized = normalizeToolCollection(...);
    return { type: 'resolved', handler: 'object', value: normalized };
  }
  // ADD: if (isSessionLabel) { ... validate session schema ... }
  // Generic path for other RHS types
};
```

---

## Grammar Extension Checklist for `session`

Numbered steps for minimal additive change:

1. **Mark `session` as reserved keyword** — `grammar/patterns/security.peggy:39`
   - Change: `const reserved = [..., 'tools'];`
   - To: `const reserved = [..., 'tools', 'session'];`

2. **Add grammar rule for `session` keyword** — `grammar/directives/var.peggy:9`
   - Add alongside `toolsSegment:(HWS "tools")?`:
     - `sessionSegment:(HWS "session")?`
   - Change line 15 to also compute:
     - `const isSessionLabel = !!sessionSegment;`
   - Keep extraction pattern: session is a bare keyword (no `DataLabelList`)

3. **Set AST flag** — `grammar/directives/var.peggy:253–254` (after tools flag check)
   - Add:
     ```peggy
     if (isSessionLabel) {
       metaInfo.isSessionLabel = true;
     }
     ```

4. **Add type to core types** — `core/types/var.ts`
   - Add to `VarMeta` interface:
     ```typescript
     isSessionLabel?: boolean;
     ```

5. **Interpreter dispatch** — `interpreter/eval/var.ts` (~line 180)
   - Extract flag:
     ```typescript
     const isSessionLabel = directive.meta?.isSessionLabel === true;
     ```
   - Pass to RHS dispatcher and variable builder

6. **Mutual exclusion check** — `interpreter/eval/var.ts` (near flag extraction)
   - Spec §4: `session` is exclusive with `secret`, `untrusted`, `pii`
   - Not enforced in grammar — add runtime validation:
     ```typescript
     if (isSessionLabel && securityLabels?.some(l => ['secret', 'untrusted', 'pii'].includes(l))) {
       throw new Error('session label cannot be combined with sensitivity/trust labels');
     }
     ```

7. **RHS dispatcher** — `interpreter/eval/var/rhs-dispatcher.ts`
   - Add `isSessionLabel` to `RhsDispatcherDependencies` interface (line 76)
   - Add handler path in `evaluate()` (new elif after tools check)

8. **Session schema validator** — `interpreter/eval/var/session-schema.ts` (NEW FILE)
   - Validate object shape: `{ field: TypeExpr, ... }`
   - Check record references exist and are input-only
   - Emit `{ [field]: { type, required, recordRef?, isArray? } }`

9. **Variable builder** — `interpreter/eval/var/variable-builder.ts`
   - Mark session schema variables with `internal.sessionSchema` flag
   - Parallel to `isToolsCollection` flag attachment

10. **Tests** — `interpreter/eval/session-schema.test.ts` (NEW FILE)
    - Basic schema parsing, type validation, record reference validation, optional handling, array types

---

## Git Archaeology: `var tools` Introduction

### Primary commit: `2681c2d5a92330d62a44106a687d7a65dc8c16be` (2026-01-23)

**Message:** "Add tool collection vars with validation"
**Author:** Adam Avenir <adam@avenir.party>

**Files touched:**
- `core/types/index.ts` — export ToolCollection type
- `core/types/tools.ts` — NEW: ToolDefinition, ToolCollection interfaces
- `core/types/var.ts` — add `isToolsCollection?: boolean` to VarMeta
- `core/types/variable/VariableTypes.ts` — add `toolCollection`, `isToolsCollection` to VariableInternalMetadata
- `grammar/directives/var.peggy` — add `toolsSegment:(HWS "tools")?` parsing + `isToolsCollection` flag
- `grammar/patterns/security.peggy` — add `'tools'` to reserved list
- `interpreter/eval/tools-collection.test.ts` — NEW: validation tests
- `interpreter/eval/var.ts` — major refactor for dispatch logic (440 lines +/- 134)

### Predecessor commit (label infrastructure): `874caec59996573b6fd930ffffe6d2c4b5df6204` (2025-10-10)

**Message:** "datalabel implementation"
**Impact:** Established `DataLabelList` grammar, security descriptor flow, `meta.securityLabels` pattern
**Files:** 25 files, 1115 insertions

### Patterns that worked

1. **Minimal grammar change:** Only added one keyword recognition rule. Did not create new top-level syntax.
2. **Flag-driven dispatch:** Set `isToolsCollection` in `meta`, branched in interpreter. Easy to extend with new labels.
3. **Reused security label infrastructure:** `DataLabelList` parsing already existed; tools piggy-backed on var's label attachment.
4. **Post-parse validation:** Did not create grammar rules for tool entry shape (`{ mlld: @exe, ... }`). Validated at runtime in `tool-scope.ts`. Kept grammar simple, validation in interpreter where environment is available.
5. **Clear variable metadata:** Marked collection in `variable.internal.isToolsCollection` + attached `variable.internal.toolCollection`. Made dispatch unambiguous downstream.

### Follow-up fixes (lessons for session)

1. **Commit a2f1129b9** (2026-01-27): "Remove dead legacy tool catalog compat" — cleaned up old parallel code paths after migration.
2. **Commit fcb268813** (2026-01-30): "Fix imported tool catalog resolution" — imported exes correctly expose tool collections.
3. **Commits acccb2662, b79c986d1, 29ba7c437** (Jan 27–30): Multiple "tool catalog" fixes — identity preservation through import/export, metadata roundtrip, runtime dispatch.

**Key lesson:** Tool collections needed identity preservation (`attachToolCollectionMetadata` symbol marker + captured module env). **Session state will be similar** — schema must survive import, and live instance must be keyed by declaration identity, not by string name.

---

## Runtime: Tool Identity Preservation (Reference Pattern)

`interpreter/eval/var/tool-scope.ts:135–150`

```typescript
export function resolveDirectToolCollection(value: unknown): ToolCollection | undefined {
  let resolved = value;
  let capturedModuleEnv: unknown;
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }

  if (isVariable(resolved)) {
    capturedModuleEnv = getCapturedModuleEnv(resolved.internal) ?? getCapturedModuleEnv(resolved);
    const directCollection =
      resolved.internal?.isToolsCollection === true &&
      resolved.internal.toolCollection &&
      typeof resolved.internal.toolCollection === 'object' &&
      !Array.isArray(resolved.internal.toolCollection);
    
    if (directCollection) {
      return sealCapturedModuleEnv(resolved.internal.toolCollection, capturedModuleEnv);
    }
  }
  // ... fallback paths
}
```

**Session analog:** Declare `internal.isSessionSchema === true` + `internal.sessionSchema` holding the parsed schema object. Session resolution inside live frames uses this flag + frame lookup.

---

## Validation Test (Reference Template)

`interpreter/eval/tools-collection.test.ts:45–65` (from commit 2681c2d5a):

```typescript
describe('tool collections', () => {
  it('creates tool collection variables with validated entries', async () => {
    const env = await interpretWithEnv(`
      /exe @readData(id: string) = js { return id; }
      /exe @deleteData(id: string) = js { return id; }
      /var tools @agentTools = {
        read: { mlld: @readData },
        delete: { mlld: @deleteData, labels: ["destructive"], expose: ["id"] }
      }
    `);

    const toolsVar = env.getVariable('agentTools');
    expect(toolsVar?.type).toBe('object');
    expect(toolsVar?.internal?.isToolsCollection).toBe(true);

    const collection = toolsVar?.internal?.toolCollection;
    expect(collection.read.mlld).toBe('readData');
    expect(collection.delete.labels).toEqual(['destructive']);
  });
  
  it('rejects invalid bind keys', async () => {
    await expect(
      interpretWithEnv(`
        /exe @createIssue(owner, repo, title) = js { return title; }
        /var tools @badTools = {
          createIssue: { mlld: @createIssue, bind: { owner: "mlld", extra: "nope" } }
        }
      `)
    ).rejects.toThrow(/bind keys/i);
  });
});
```

---

## Extension Points Summary

| Layer | File | Changes | Pattern |
|---|---|---|---|
| **Grammar** | `grammar/patterns/security.peggy` | Add `'session'` to reserved (1 line) | Same as tools |
| **Grammar** | `grammar/directives/var.peggy` | Add `sessionSegment:(HWS "session")?` parsing + meta flag (5–7 lines) | Same as tools |
| **Core types** | `core/types/var.ts` | Add `isSessionLabel?: boolean` to VarMeta | Same as tools |
| **Interpreter main** | `interpreter/eval/var.ts` | Extract `isSessionLabel` flag, mutual-exclusion check, pass to dispatcher | Parallel to tools |
| **RHS dispatcher** | `interpreter/eval/var/rhs-dispatcher.ts` | Add `isSessionLabel` to deps, route to schema validator | Parallel to tools |
| **NEW: Schema validator** | `interpreter/eval/var/session-schema.ts` | Parse + validate `{ field: TypeExpr }` shape | Unique to session |
| **NEW: Session runtime** | `interpreter/eval/var/session-runtime.ts` | Frame lifecycle, instance materialization, accessor methods | New concept |
| **Variable builder** | `interpreter/eval/var/variable-builder.ts` | Mark session schema variables with `internal.sessionSchema` | Parallel to tools |
| **Tests** | `interpreter/eval/session-schema.test.ts` | Grammar, parsing, validation, error cases | Parallel to tools-collection.test.ts |
| **Tests** | `interpreter/eval/session-runtime.test.ts` | Nesting, concurrency isolation, frame lifecycle | New concept |
| **Docs** | `benchmarks/labels-policies-guards.md` | Add §"Session State Accessors" with `.set()`, `.write()`, `.increment()` examples | New section |

---

## Flags & Peggy-Specific Pitfalls

### Grammar Composition Rules

1. **Keyword ordering:** `var <toolsOrSession> <labels> @name = value`
   - Current: `var tools @x = { ... }` (tools alone)
   - Current: `var secret @y = "text"` (label alone)
   - **New:** `var session @z = { ... }` (session alone)
   - **NOT:** `var tools session @x = ...` (exclusive)
   - Grammar enforces via single segment rules (not a label list).

2. **Label incompatibility (runtime check):** `session` is exclusive with `secret`, `untrusted`, `pii`. Not in grammar; add runtime validation after labels parsed.

3. **RHS parsing — no grammar change needed:** `{ field: TypeExpr, ... }` parses as a normal `DataObjectLiteral`. Validation happens post-parse.

4. **Peggy semantic action limitation:** The `&{...}` lookahead predicate in `DataLabelIdentifier` reserves keywords. Keep reserved list concise; `'session'` is a single string append.

---

## Files to Edit in Order

1. **Grammar reservation:** `grammar/patterns/security.peggy:39` — add `'session'`
2. **Grammar keyword:** `grammar/directives/var.peggy:9–14` — add `sessionSegment:(HWS "session")?`
3. **AST metadata:** `grammar/directives/var.peggy:252–256` — set `metaInfo.isSessionLabel = true`
4. **Core types:** `core/types/var.ts` — add `isSessionLabel?: boolean`
5. **Interpreter dispatch:** `interpreter/eval/var.ts:~180` — extract flag, mutual-exclusion check, pass to dispatcher
6. **RHS dispatcher interface:** `interpreter/eval/var/rhs-dispatcher.ts:76` — add field
7. **RHS dispatcher handler:** `rhs-dispatcher.ts:evaluate()` — add elif branch
8. **NEW Schema validator:** `interpreter/eval/var/session-schema.ts`
9. **Variable builder:** `interpreter/eval/var/variable-builder.ts`
10. **Tests:** `interpreter/eval/session-schema.test.ts`

---

## Non-Goals Confirmation

**Did NOT:**
- Design session grammar itself (from spec §4)
- Decide access API (`.set()`, `.write()`, `.increment()` from spec §6)
- Choose runtime frame lifecycle (spec §5)
- Build interpreter-side session frame management or write-commit logic
- Design taint/label propagation rules (spec §8)

**Documented:**
- Where grammar surface is: `var.peggy:9`, `security.peggy:39`
- Label-driven dispatch pattern
- `var tools` precedent files for parallel changes
- Extension points in execution order
- Git commits with dates and file counts
