# Plan: Runtime Lazy Structured Values Memory - Phases 0-3

## Overview

Reduce travel/c-63fe memory pressure by tightening mlld's existing runtime lazy-value discipline without changing security, record, policy, session, MCP, or JS interop semantics. This version intentionally scopes active work to Phases 0-3 only: characterization, lazy structured clone behavior, immutable security descriptor interning, and factsource/projection metadata interning.

Deferred work is explicitly out of scope for this plan: lazy public `mx` contexts, copy-on-write session snapshots, and plain prompt projections. Sessions appear here only as preservation tests, because Phase 0-3 changes must not break session read/write behavior.

## Critical Evaluation Of The Prior Draft

The prior plan had the right hotspot list, but it was too broad to implement confidently in one pass. Phases 4-6 mixed higher-risk mutability and prompt-boundary changes into the same roadmap as low-level storage fixes, making it hard to tell which change caused a regression.

The draft also named eager URL extraction as a problem, but that needs a security caveat: `no-novel-urls` depends on eager recursive URL discovery before an influenced value reaches an exe guard. The implementation path is `snapshotPolicyArgDescriptors(...)` -> descriptor URLs -> `makeNoNovelUrlsGuard(...)`; the guard does not rescan raw argument values. Therefore Phase 1 must preserve eager URL extraction for policy-visible values and external-input URL registry updates. The optimization target is accidental text materialization and duplicate metadata allocation, not weakening URL provenance.

The draft proposed adding `getMaterializedStructuredText(...)`, but this helper already exists privately in multiple files:

- `core/types/variable/VariableMetadata.ts`
- `core/types/variable/VariableFactories.ts`
- `interpreter/utils/handle-resolution.ts`
- `interpreter/eval/exec-invocation.ts`

Do not centralize this helper in `interpreter/utils/structured-value.ts`: that file imports `VariableMetadataUtils`, so `core/types/variable/VariableMetadata.ts` importing it would create a cycle. Phase 1 should put the duck-typed helper in a lower-level module such as `core/utils/materialized-text.ts`, then import it from both core and interpreter code.

Finally, the memory harness cannot depend on `/Users/adam/mlld/clean/tmp/...` as a required input. The c-63fe repro is useful source material, but the plan must leave a self-contained harness in this repo so future work can be resumed without external checkout state.

## Active Scope

Included:

- `StructuredValue` text laziness through wrapper clones.
- Eager URL extraction preservation for `no-novel-urls`, with tests that prevent accidental weakening.
- Security descriptor empty-singleton and bounded interning.
- Factsource arrays, factsource handles, and record projection metadata interning.
- Focused semantic and identity tests for records, policies, sessions, and structured boundaries.
- Opt-in local memory harnesses with relative comparisons, not exact CI RSS thresholds.

Excluded:

- Lazy/cached public `mx` object construction.
- Copy-on-write session snapshots.
- LLM/MCP prompt projection redesign.
- Rig behavior changes.
- Removing proof metadata, factsources, handles, `entry.value`, or record projection metadata.
- Changing JS/Node/Python default interop to receive opaque lazy thunks.

## Must-Read References

- `docs/dev/DATA.md` - carrier layers and boundary taxonomy.
- `docs/dev/LLM-MCP.md` - session, bridge, and wrapper-exe identity risks.
- `interpreter/utils/structured-value.ts` - `wrapStructured`, text getter, metadata cloning, `mx` construction, namespace child materialization.
- `core/security/url-provenance.ts` - recursive URL extraction. Keep eager extraction available for `no-novel-urls` and the external-input URL registry.
- `core/utils/materialized-text.ts` (new) - cycle-free helper for reading already materialized own `text` data properties.
- `core/types/security.ts` - descriptor construction, normalization, merge, serialization.
- `interpreter/eval/records/coerce-record.ts` - factsources and projection metadata creation.
- `interpreter/utils/field-access.ts` - field metadata propagation.
- `core/policy/guards.ts` - policy guard factsource correlation and `no-novel-urls` descriptor checks.
- `interpreter/session/runtime.ts` - preservation baseline only; do not optimize sessions in this plan.

## Current Hotspots

Known eager or duplicating behavior:

- `interpreter/utils/structured-value.ts:358-363` clones existing structured values with `text ?? value.text`, which materializes large object/array text during metadata/type updates.
- `interpreter/utils/structured-value.ts:511-528` calls `extractUrlsFromValue(text === undefined ? [data] : [data, text])`. This scan is policy-sensitive; do not remove it without moving equivalent eager URL discovery to the guard/descriptor path.
- `core/types/variable/VariableFactories.ts:65-77` finalizes variables by calling `extractUrlsFromValue(variable.value)`. This is also policy-sensitive because `no-novel-urls` reads URLs from argument descriptors.
- `core/types/security.ts:429-466` currently rebuilds descriptors in `removeLabelsFromDescriptor(...)` without forwarding `urls`; any Phase 2 descriptor work should preserve URL provenance here.
- `interpreter/utils/structured-value.ts:564-586`, `:695-760`, and `core/types/variable/VarMxHelpers.ts:119-131` repeatedly clone descriptor arrays into public `mx`.
- `core/types/security.ts:162-167` returns a newly frozen empty array on each missing iterable.
- `core/types/security.ts:237-285` creates a fresh descriptor object for repeated equal descriptors.
- `interpreter/eval/records/coerce-record.ts:114-135`, `:500-515`, `:541-568`, `:878-897`, and `interpreter/utils/field-access.ts:1655-1665` allocate repeated factsource/projection arrays and metadata objects.

## Design Decisions

### Decision 1: Preserve behavior, change timing and object identity only

`value.text`, `asText(value)`, template interpolation, `/show`, shell interpolation, display projection, and serialization must still synchronously return concrete text. The change is that non-display work must not force text or recursively walk large graphs by accident.

### Decision 2: Do not make `mx` lazy in Phases 0-3

The public `mx` object is still eagerly present and mutable enough for current runtime code. Phases 2-3 may reuse canonical empty arrays and interned metadata arrays where existing behavior already tolerates frozen arrays, but wholesale lazy `mx` construction is deferred.

### Decision 3: Preserve eager URL provenance for `no-novel-urls`

`no-novel-urls` requires two eager URL-discovery paths:

1. External-input registry: `env.recordKnownUrlsFromValue(...)` scans tool results, user payloads, file reads, imports, and loaded content so known URLs are available as `@mx.urls.registry`.
2. Influenced argument descriptors: variable/structured-value security metadata must include URLs before guard evaluation, because `makeNoNovelUrlsGuard(...)` checks `descriptor.urls` and does not rescan the argument payload.

Therefore Phases 0-3 must not replace recursive URL extraction with materialized-text-only extraction in `VariableFactories.finalizeVariable(...)`, `applySecurityDescriptorToStructuredValue(...)`, or any path that feeds policy arg descriptors. Any future optimization here needs a separate security design, likely moving eager extraction into `snapshotPolicyArgDescriptors(...)` while preserving current tests.

### Decision 4: Intern immutable core metadata only

Security descriptors, factsource handles/arrays, and record projection metadata are immutable and good interning targets. Do not intern or share mutable session state, `internal` bags, tool collections, captured module environments, or public prompt payloads in this plan.

### Decision 5: Bound caches and skip unsafe keys

Interning must not create an unbounded long-lived memory cache. Descriptor and record metadata interning should use bounded maps. If a policy context, tool provenance, display config, or projection payload cannot be keyed safely and cheaply, freeze/normalize it without interning.

## Research Status Before Implementation

Already verified during plan review:

- The referenced unit/integration test files exist.
- `npx vitest run interpreter/utils/structured-value.test.ts core/security/url-provenance.test.ts tests/integration/policy-novel-urls.test.ts tests/core/security-descriptor.test.ts interpreter/eval/records/coerce-record.test.ts interpreter/eval/records/display-projection.test.ts interpreter/eval/session.test.ts` passes.
- `npx vitest run interpreter/eval/exec-invocation.structured.test.ts interpreter/eval/var/security-descriptor.test.ts core/types/variable/VariableFactories.test.ts interpreter/utils/handle-resolution.test.ts` passes.
- `npm run build` passes.

Remaining pre-change confidence gaps:

- Phase 0 still needs the self-contained memory/identity harness.
- `tests/integration/policy-novel-urls.test.ts` currently covers scalar novel/known URL cases; Phase 1 must add nested object/array cases before changing clone/materialization behavior.
- Phase 3 implementation should keep `core/policy/guards.ts` correlation dedupe semantically separate from exact factsource-handle interning.

## Phase 0: Characterization And Repro Harness

Goal: establish semantic baselines and a local memory signal before production behavior changes.

### Tasks

1. Add a self-contained harness under `tests/runtime-lazy-values/`.
   - Suggested entrypoint: `tests/runtime-lazy-values/harness.ts`.
   - Run with `npx tsx tests/runtime-lazy-values/harness.ts --records 160 --fields 12 --text-size 0 --sessions true`.
   - Make record count, field count, factsources, text size, and session use configurable.
   - Emit JSON lines for stages:
     - `wrap-object`
     - `clone-with-metadata`
     - `record-coercion`
     - `field-access`
     - `session-write-read`
     - `display-serialize`
   - Include `process.memoryUsage()` fields and semantic counters.
   - If `globalThis.gc` exists, collect a `postGc` sample. Do not require `--expose-gc` for normal runs.

2. Include semantic counters in the harness.
   - Count `toJSON` calls on synthetic large objects.
   - Count whether `text` is still an accessor with `Object.getOwnPropertyDescriptor(value, 'text')`.
   - Count nested URL discoverability for policy-visible values separately from text materialization.
   - Count distinct security descriptor identities for repeated equal descriptors.
   - Count distinct factsource array identities for repeated field metadata.
   - Count distinct projection metadata identities for repeated record definitions.

3. Add or confirm focused baseline tests that already pass.
   - `interpreter/utils/structured-value.test.ts`
     - Object/array wrappers created without explicit text keep `text` as an accessor until `asText` or `.text`.
     - `asText` materializes once and replaces the accessor with an own data property.
   - `core/security/url-provenance.test.ts`
     - `extractUrlsFromValue(...)` remains recursive and skips getters/opaque runtime values.
   - `tests/integration/policy-novel-urls.test.ts`
     - Existing guard coverage denies scalar novel URLs and allows scalar registry-known URLs.
     - Nested object/array policy cases are added in Phase 1.
   - `interpreter/eval/records/coerce-record.test.ts`
     - Current record fact labels, `mx.factsources`, and display projection still work.
   - `interpreter/eval/session.test.ts`
     - Existing structured metadata preservation through session write/read stays green.

4. Capture a baseline artifact.
   - Commit or save `tests/runtime-lazy-values/README.md` with exact command examples and what fields to compare.
   - Do not check in large output files.
   - The c-63fe external harness in `/Users/adam/mlld/clean/tmp/c63fe-late-spike/` may be used as source material, but the repo harness must stand alone.

### Exit Criteria

**Test Status**

- [ ] `npx vitest run interpreter/utils/structured-value.test.ts core/security/url-provenance.test.ts tests/integration/policy-novel-urls.test.ts interpreter/eval/records/coerce-record.test.ts interpreter/eval/session.test.ts`
- [ ] `npm run build`

**Validation**

- [ ] Harness runs at small and medium scales without LLM calls.
- [ ] Harness reports current duplicated-materialization signals for clone-with-metadata and/or record metadata identity.
- [ ] No production runtime behavior changes in Phase 0.

**Deliverable**

A reproducible, zero-LLM local harness and passing baseline tests.

## Phase 1: Preserve Lazy Text Through Structured Clones

Goal: stop wrapper clones and metadata updates from accidentally materializing text while preserving eager recursive URL extraction required by `no-novel-urls`.

### Primary Files

- `interpreter/utils/structured-value.ts`
- `core/types/variable/VariableFactories.ts`
- `core/types/variable/VariableMetadata.ts`
- `interpreter/utils/handle-resolution.ts`
- `interpreter/eval/exec-invocation.ts`
- `core/security/url-provenance.ts`
- `core/security/url-provenance.test.ts`
- `interpreter/utils/structured-value.test.ts`

### Tasks

1. Add one canonical helper in a cycle-free core module.

   Suggested file: `core/utils/materialized-text.ts`.

   ```ts
   export function getMaterializedStructuredText(value: unknown): string | undefined {
     if (!value || typeof value !== 'object') return undefined;
     const descriptor = Object.getOwnPropertyDescriptor(value, 'text');
     return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
       ? descriptor.value
       : undefined;
   }
   ```

   Replace the private copies in:

   - `core/types/variable/VariableMetadata.ts`
   - `core/types/variable/VariableFactories.ts`
   - `interpreter/utils/handle-resolution.ts`
   - `interpreter/eval/exec-invocation.ts`
   - `interpreter/utils/structured-value.ts`

2. Change structured clone text defaulting.
   - Current: `text ?? value.text`
   - New: `text ?? getMaterializedStructuredText(value)`
   - Explicit caller text still wins.
   - Primitive/string structured values still keep materialized text because they are created with an own `text` data property.

3. Preserve eager recursive URL extraction.
   - Leave `extractUrlsFromValue(...)` recursive.
   - Keep `VariableFactories.finalizeVariable(...)` recursive so influenced variables populate `mx.urls` before guard evaluation.
   - Keep `applySecurityDescriptorToStructuredValue(...)` recursive so labels applied after value creation still discover URLs before policy checks.
   - Keep `env.recordKnownUrlsFromValue(...)` recursive for external input registry updates.
   - Do not introduce a materialized-only URL helper in this phase; that would be a separate security refactor.

4. Add tests that lock the `no-novel-urls` contract.
   - Existing novel URL literal test remains denied.
   - Add or confirm an influenced structured object/array argument with a nested novel URL is denied.
   - Add or confirm an influenced structured object/array argument with a nested URL from user payload or file-read registry is allowed.
   - Add a regression asserting `wrapStructured(existingStructured, ..., metadata)` does not materialize `.text` while URL extraction still sees nested URLs in `.data`.

5. Audit explicit display and serialization callers.
   - Search:
     - `rg "wrapStructured\\(.*\\.text|value\\.text|asText\\(" interpreter core`
   - For any site that intentionally wants display text before wrapping, make it call `asText(value)` explicitly and add a one-line comment only if the boundary is not obvious.
   - Known intentional display/materialization sites include `/show`, output rendering, shell interpolation, display projection previews, and final serializers.
   - Known intentional materialization to preserve unless separately redesigned:
     - `interpreter/eval/content-loader/finalization-adapter.ts:31,40` uses loader result text as canonical loaded content.
     - `interpreter/policy/authorization-compiler.ts:558-572` derives known-handle previews.
     - display projection preview paths in `interpreter/eval/records/display-projection.ts`.

6. Add lazy-text regression tests.
   - `wrapStructured(existingStructured, undefined, undefined, metadata)` does not call `toJSON` on object data.
   - The clone still has an accessor `text` property until `.text` or `asText` is read.
   - Explicit text still materializes and preserves URL extraction from that text.
   - Recursive `extractUrlsFromValue(...)` still finds nested object URLs when called directly.
   - Variable finalization recursively scans lazy structured object data without materializing `.text`.

### Risks

- Some caller may have been relying on clone-as-display behavior. The audit must convert those to explicit `asText(...)`.
- URL provenance behavior is security-sensitive. The safe rule for Phases 0-3 is: eager recursive URL extraction remains intact; only text materialization timing changes.

### Exit Criteria

**Test Status**

- [ ] `npx vitest run interpreter/utils/structured-value.test.ts core/security/url-provenance.test.ts tests/integration/policy-novel-urls.test.ts`
- [ ] `npx vitest run interpreter/eval/exec-invocation.structured.test.ts interpreter/eval/session.test.ts`
- [ ] `npm run build`

**Validation**

- [ ] Phase 0 harness shows clone-with-metadata no longer materializes object/array text.
- [ ] Phase 0 harness URL counters remain security-compatible: nested URLs are still discovered for policy-visible influenced values and known external inputs.
- [ ] Structured boundary fixture suites still pass:
  - `npm test tests/cases/feat/structured-value-preservation`
  - `npm test tests/cases/feat/structured-boundaries`

**Deliverable**

Structured clones and variable finalization preserve lazy object/array text. Eager URL provenance for `no-novel-urls` remains intact.

## Phase 2: Intern Security Descriptors And Canonical Empties

Goal: make repeated equal security descriptors share immutable storage while keeping public `mx` behavior stable.

### Primary Files

- `core/types/security.ts`
- `tests/core/security-descriptor.test.ts`
- `core/types/variable/VarMxHelpers.ts`
- `interpreter/utils/structured-value.ts`
- `interpreter/eval/var/security-descriptor.test.ts`

### Tasks

1. Add canonical empty arrays and an empty descriptor singleton.
   - `freezeArray(undefined)` and `freezeArray([])` should return the same frozen empty array for each element family where type-safe.
   - `makeSecurityDescriptor()` should return the same frozen empty descriptor.
   - Empty `urls` and `tools` should normalize to omitted/undefined in serialized output exactly as today.

2. Tighten descriptor normalization.
   - Add a private module-local normalized descriptor brand, or an equivalent robust check.
   - `normalizeSecurityDescriptor(input)` may return `input` only if it is known-normalized, not merely array-shaped.
   - Otherwise it should rebuild through `makeSecurityDescriptor(...)`.
   - Mutating caller input after descriptor construction must not affect the descriptor.
   - Preserve URL provenance in every descriptor transform, especially `removeLabelsFromDescriptor(...)`.

3. Add bounded descriptor interning.
   - Key by normalized labels, taint, attestations, sources, urls, tools, capability, and policy context when the policy context can be stably and cheaply serialized.
   - Use a bounded map, for example 4096 entries.
   - Skip interning for descriptors with large or unstable policy/tool payloads; still freeze/normalize them.
   - `mergeDescriptors(...)` should also return interned descriptors when possible.

4. Keep `mx` conservative in Phase 2.
   - It is acceptable to reuse canonical empty arrays in `mx` because current code already has frozen empty `mx` arrays in `VarMxHelpers`.
   - Do not share non-empty descriptor arrays into public `mx` yet unless tests prove the receiving code treats them as read-only.
   - Public `mx` laziness and full immutable `mx` projection remain deferred.

5. Add identity and serialization tests.
   - `makeSecurityDescriptor()` returns the same object each time.
   - `makeSecurityDescriptor({ labels: ['known'], sources: ['src:mcp'] })` returns the same interned object for repeated equal calls.
   - Descriptors with the same labels in the same order produce unchanged serialized output.
   - Input arrays can be mutated after construction without changing descriptor contents.
   - Descriptor arrays and descriptor objects are frozen.
   - `removeLabelsFromDescriptor(...)` preserves `urls`, `sources`, `tools`, `capability`, and `policyContext`.
   - `serializeSecurityDescriptor(...)` output is unchanged.

### Risks

- Hidden internal mutation of descriptor arrays would fail once arrays are shared. Searches show reassignment of `mx.*` fields is common, but direct mutation of descriptor arrays should not be.
- Policy-context keys can be expensive or unstable. Skip interning rather than building a risky key.

### Exit Criteria

**Test Status**

- [ ] `npx vitest run tests/core/security-descriptor.test.ts interpreter/eval/var/security-descriptor.test.ts`
- [ ] `npx vitest run interpreter/utils/structured-value.test.ts interpreter/eval/records/coerce-record.test.ts`
- [ ] `npm run build`

**Validation**

- [ ] Phase 0 harness reports fewer distinct descriptor identities for repeated equal descriptors.
- [ ] Security and policy fixture suites still pass:
  - `npm test tests/cases/feat/policy`
  - `npm test tests/cases/feat/structured-boundaries`

**Deliverable**

Security descriptors and common empty arrays are immutable, canonical, bounded, and serialization-compatible.

## Phase 3: Intern Factsources And Record Projection Metadata

Goal: stop record coercion and field access from allocating repeated projection metadata and duplicate factsource arrays while preserving proof-bearing behavior and handle resolution.

### Primary Files

- `core/types/handle.ts`
- `core/types/record.ts`
- `interpreter/eval/records/coerce-record.ts`
- `interpreter/eval/records/display-projection.ts`
- `interpreter/utils/field-access.ts`
- `interpreter/utils/structured-value.ts`
- `interpreter/shelf/runtime.ts` for compatibility checks only
- `interpreter/eval/records/coerce-record.test.ts`
- `interpreter/eval/records/display-projection.test.ts`
- `interpreter/eval/exec-invocation.structured.test.ts`
- `core/policy/guards.ts` for compatibility checks only

### Tasks

1. Add factsource intern helpers.
   - In or near `core/types/handle.ts`, add helpers such as:
     - `getFactSourceKey(handle)`
     - `internFactSourceHandle(handle)`
     - `internFactSourceArray(handles)`
   - Key handles by all semantically relevant fields:
     - `kind`
     - `ref`
     - `sourceRef`
     - `field`
     - `instanceKey`
     - `coercionId`
     - `position`
     - `tiers`
   - Do not drop or coarsen `coercionId`, `position`, or `instanceKey`; handle round-trips depend on them.
   - Return frozen arrays and frozen handles.
   - Use a bounded cache.
   - Expected payoff is mostly intra-value and repeated-access sharing. Do not expect different record instances to collapse when `coercionId`, `position`, or `instanceKey` differ.

2. Use factsource arrays consistently.
   - Replace local full-handle `dedupeFactSources(...)` in `coerce-record.ts` with `internFactSourceArray(...)`.
   - Replace `factsources: [...factsources]` and `value.mx.factsources = [...factsources]` in record coercion with interned arrays where safe.
   - Replace copies in `field-access.ts:1655-1665` with interned arrays.
   - Replace copies in `structured-value.ts:1055-1061` namespace child materialization with interned arrays.
   - Check `interpreter/eval/exec-invocation.ts:1229-1385` and `:1463-1530` for duplicate factsource key logic; prefer the shared key helper, but keep boundary clones where the policy/authorization layer intentionally materializes independent payloads.
   - Do not replace `core/policy/guards.ts` factsource correlation dedupe with full-handle interning. That guard intentionally groups by record instance (`instanceKey`, or `coercionId` plus `position`) rather than exact handle identity.
   - Check `interpreter/shelf/runtime.ts:469-477` and `:633-639` for compatibility with frozen factsource arrays before changing shelf writes.

3. Add projection metadata intern helpers.
   - In or near `core/types/record.ts`, add shared builders/interners such as:
     - `buildRecordFieldProjectionMetadata(...)`
     - `buildRecordObjectProjectionMetadata(...)`
     - `internRecordFieldProjectionMetadata(...)`
     - `internRecordObjectProjectionMetadata(...)`
     - `internRecordProjectionMetadata(...)`
   - Key field projection by record name, field name, classification, and display mode/config.
   - Key object projection by record name, display mode/config, and field classification map.
   - Use stable serialization with sorted object keys for display config; skip interning if the key would be too large or unsafe.
   - Freeze returned projection metadata.
   - Preserve current per-call shape. `coerce-record.ts` currently omits `dataTrust` from projection metadata in some paths while `shelf/runtime.ts` includes it. Either preserve that behavior initially or add targeted tests before normalizing the shape.

4. Use projection helpers at creation and propagation points.
   - `buildRecordObjectProjectionMetadata(...)`
   - `buildRecordFieldProjectionMetadata(...)`
   - Duplicate builders in both `interpreter/eval/records/coerce-record.ts:183-212` and `interpreter/shelf/runtime.ts:131-159`
   - `setRecordProjectionMetadata(...)`
   - `materializeStructuredNamespaceChild(...)`
   - Any display-projection path that synthesizes equivalent projection metadata.

5. Keep semantic proof behavior unchanged.
   - Whole-record refs still resolve.
   - Field refs still resolve.
   - `@contact.email.mx.factsources[0].ref` remains unchanged.
   - Display projection still emits the same handles/previews.
   - Policy compilation from selected refs remains unchanged.
   - Module import/export of record values remains unchanged.
   - Session write/read of record values preserves factsources and projection metadata.

6. Add identity and behavior tests.
   - Repeated fields from the same record definition share field projection metadata object identity.
   - `metadata.factsources` and `mx.factsources` use the intended interned array identity for the same field wrapper.
   - Distinct record instances with distinct `coercionId` or `position` do not collapse to the same handle when that identity differs.
   - Existing output assertions for `.mx.factsources`, handles, display projection, and policy authorization remain unchanged.

### Risks

- Factsource handles are proof-bearing. Interning must preserve every identity field, not just `ref`.
- Freezing arrays may expose hidden mutation. If a legitimate mutating site appears, keep that site on a local mutable clone and document it.
- Projection metadata may include display config objects. Use stable keys only where cheap and deterministic.

### Exit Criteria

**Test Status**

- [ ] `npx vitest run interpreter/eval/records/coerce-record.test.ts interpreter/eval/records/display-projection.test.ts interpreter/eval/exec-invocation.structured.test.ts`
- [ ] `npx vitest run interpreter/eval/session.test.ts interpreter/utils/structured-value.test.ts`
- [ ] `npm run build`

**Validation**

- [ ] Phase 0 harness reports fewer distinct factsource array and projection metadata identities.
- [ ] Record and policy fixture suites still pass:
  - `npm test tests/cases/feat/records`
  - `npm test tests/cases/feat/policy`
  - `npm test tests/cases/feat/structured-boundaries`
- [ ] No handle resolution, display projection, or session preservation regressions.

**Deliverable**

Record proof metadata is immutable and shared where identity-safe, with no user-visible changes to factsources, handles, projection output, policy authorization, or session preservation.

## Overall Exit Criteria For Phases 0-3

**Required Commands**

- [ ] `npm run build`
- [ ] `npx vitest run interpreter/utils/structured-value.test.ts core/security/url-provenance.test.ts tests/core/security-descriptor.test.ts interpreter/eval/records/coerce-record.test.ts interpreter/eval/records/display-projection.test.ts interpreter/eval/session.test.ts`
- [ ] `npm test tests/cases/feat/structured-value-preservation`
- [ ] `npm test tests/cases/feat/structured-boundaries`
- [ ] `npm test tests/cases/feat/records`
- [ ] `npm test tests/cases/feat/policy`

**Memory Validation**

- [ ] Run `tests/runtime-lazy-values/harness.ts` before Phase 1 and after each phase.
- [ ] Compare relative heap/RSS and semantic identity counters.
- [ ] Do not require exact RSS thresholds in default CI.
- [ ] Treat semantic counters as the reliable signal; RSS is supporting evidence.

**Security And Boundary Validation**

- [ ] Explicit recursive `extractUrlsFromValue(...)` behavior remains tested and available.
- [ ] Display/interpolation boundaries still materialize text.
- [ ] `boundary.field`-style reads preserve wrappers, factsources, projection metadata, and security labels.
- [ ] `boundary.plainData` and spread remain destructive materialization boundaries.
- [ ] Tool collection and `capturedModuleEnv` identity behavior is untouched.
- [ ] Session behavior is preserved but not optimized.

## Deferred Follow-Up Work

These are intentionally not part of Phases 0-3:

- Lazy or compact public `mx` contexts.
- Copy-on-write session snapshots.
- Boundary-specific plain prompt projections.
- Rig-side source filtering or prompt composition changes.

Reassess after Phase 3 using the harness and the targeted travel/c-63fe repro. Only start the deferred work if the remaining memory spike is still dominated by `mx` construction, session snapshot cloning, or prompt payload shape.
