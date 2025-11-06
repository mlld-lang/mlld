# Import & Security Types Implementation Plan

## Objectives
- Introduce explicit import capability types (`module`, `static`, `live`, `cached`, `local`) and data labels (DataLabels) as first-class syntax, AST, and runtime concepts.
- Replace the legacy trust/TTL system with a capability-oriented model that powers taint tracking, guard enforcement, and auditability.
- Establish `/guard` as the declarative hook surface for capability checks while keeping the runtime extensible and testable.

## Guiding Principles
- **Capability first**: every import, executable, and effect carries a `CapabilityContext` describing import type, data labels, taint, and provenance.
- **Typed propagation**: metadata travels through the TypeScript type system via immutable descriptors and helper utilities.
- **Incremental validation**: each phase lands with focused parser, interpreter, and integration tests before advancing.
- **Secure by default**: absence of metadata resolves to conservative `unknown` descriptors that guards treat as untrusted.
- **Timeless documentation**: new docs and comments describe current behaviour without historical references.

## Phase 0 – Preparation & Shared Scaffolding _(completed)_
- **Retired legacy trust/TTL paths**: removed enums, parser fragments, config keys, lock-file fields, and approval prompts tied to the old model. Any lingering references now trigger lint/test failures.
- **Added scaffolding modules**:
  - Create `core/types/security.ts` exporting placeholder `ImportType`, `DataLabel`, `SecurityDescriptor`, `CapabilityContext`, and helper stubs.
  - Create `core/types/guards.ts` with provisional `GuardEvent`, `GuardDecision`, and `GuardThunk` types.
- **Captured architecture references**:
  - Draft a short design note (docs/dev) showing grammar→AST→runtime data flow with screenshots/diagrams.
  - Annotate key interpreter files with TODO markers indicating where capability metadata will hook in.
- **Seeded test utilities**: helper assertions for future security descriptors now live under `tests/utils/security.ts`.
- **Baseline verification**: `npm test` now passes without TTL/trust artefacts; the `path-validation` suite uses a fetch override hook to simulate remote content.
- **Follow-up**: document the removal of `URLCache.ts`; any future caching work will reuse the simplified `CacheManager` hook.

## Phase 1 – Import-Type Grammar & Runtime (No Security Labels Yet)
- Extend `/import` grammar and supporting patterns to parse explicit import type keywords (`module`, `static`, `live`, `cached`, `local`). Remove all TTL/trust grammar.
- Update AST (`core/types/import.ts`, `core/types/values.ts`, directive nodes) to include `importType?: ImportType`, leaving data labels undefined for now.
- Refactor runtime import resolution (`ImportPathResolver`, `ImportDirectiveEvaluator`, `ImportSecurityValidator`) to honour the five import types, adjust resolver behaviour, and replace TTL-based caching with explicit duration metadata for `cached`.
- Regenerate parser artifacts and update parser/interpreter tests to confirm the new import behaviour and absence of TTL parsing.
- Update docs/tests to reflect the new import syntax; no data labels or guards yet. Ensure any tests that relied on trust/TTL stubs are rewritten or removed (e.g., integration/modules fixture already updated).
- Optional: retire the legacy `/path` directive in favor of import capabilities once core updates land.

## Phase 2 – Security Descriptor Foundations
- Implement final types in `core/types/security.ts`: `DataLabel`, `SecurityDescriptor`, helper utilities, and `CapabilityContext` shapes.
- Extend grammar and AST nodes to parse optional data labels on `/import`, `/var`, `/exe`, `/run`, `/show`.
- Adjust `VariableMetadata` and `VariableFactories` to accept and store `SecurityDescriptor` placeholders (without taint merge logic yet).
- Add unit tests ensuring labels parse correctly and propagate into AST nodes.

## Phase 3 – Taint Tracking & Metadata Propagation
- Integrate the `TaintTracker` from `security-wip` (migrated to `core/security/taint.ts`), adapting enums to the new label set and exposing merge helpers.
- Update evaluators (`/import`, `/var`, pipeline stages, command outputs) to construct `SecurityDescriptor` instances and merge them as values combine. Default to `unknown` when provenance is missing.
- Ensure variables store both `security` and `capability` metadata in `VariableMetadata`; add helper guards (`getSecurity`, `hasLabel`, `mergeDescriptors`).
- Add comprehensive tests covering propagation across arrays, objects, templates, pipelines, and nested imports.

## Phase 4 – Guard Directive Runtime
- Finalize `GuardEvent`, `GuardDecision`, and `GuardThunk` definitions; implement guard registration and dispatch in `Environment`.
- Extend grammar and AST to support `/guard` directives that compile into thunks. Guard thunks receive event-specific `CapabilityContext` copies.
- Invoke guards before key capability crossings (imports, command executions, outputs). Define default behaviour for deny decisions.
- Provide example guards and integration tests: deny live secrets, require approval for untrusted commands, allow module-only PII.

## Phase 5 – Secret Inference & Enforcement Modes
- Wire in a secret detection strategy for `typeInference: "basic"`, storing inference provenance on descriptors.
- Implement `strict` (reject missing labels) and `paranoid` (default untrusted) modes in config loading; ensure inference + explicit labels merge predictably.
- Add configuration schema updates, documentation, and tests for each mode.

## Phase 6 – Documentation, Tooling, and Rollout
- Update developer/user docs, `/guard` guide, and `llms.txt` with the new capability model (present tense only).
- Adjust LSP semantic token rules and tests to highlight import types and labels.
- Ensure `AuditLogger` records capability context for CaMeL-style audits.
- Publish migration guidance (internal) explaining manual upgrade steps.

## Cross-Cutting Tasks
- Maintain a shared checklist tracking grammar, types, runtime, tests, docs, and exports touched in each phase. Update the checklist now that trust/TTL removals are complete.
- Run periodic threat-model reviews once guards/taint land.
- Monitor performance for metadata-heavy scenarios; add benchmarks where import-heavy workflows might regress.
- Keep `docs/dev/SECURITY-VISION.md` and related guidance annotated with “legacy” notes until the capability-centric docs are in place.

## Phase Acceptance Criteria
- **Phase 0 – Preparation & Shared Scaffolding**
  - No remaining references to trust/TTL fields across grammar, config loaders, runtime, CLI, or docs.
  - `core/types/security.ts` and `core/types/guards.ts` compile with placeholder exports.
  - Supporting docs highlight grammar→AST→runtime touchpoints; interpreter TODOs mark hook locations.
  - Test suites pass with the new scaffolding; `tests/utils/security.ts` exposes descriptor helpers.
- **Phase 1 – Import-Type Grammar & Runtime**
  - Parser accepts the five import keywords and rejects legacy TTL syntax.
  - Runtime honours each import type’s behaviour (cache, resolver, local override).
  - Back-compat fixtures surface actionable errors for removed syntax.
  - User/dev docs reflect the keyword-based grammar.
- **Phase 2 – Security Descriptor Foundations**
  - Grammar emits `securityLabels` arrays for `/import`, `/var`, `/exe`, `/run`, `/show`.
  - `SecurityDescriptor` helpers are finalized with unit tests.
  - Variables created through directives persist descriptors (taint merge deferred to Phase 3).
- **Phase 3 – Taint Tracking & Metadata Propagation**
  - `TaintTracker` integrated with merge helpers aligned to the new label set.
  - Evaluators construct and merge descriptors through arrays, objects, pipelines, command outputs.
  - Variables expose metadata helpers (`getSecurity`, `hasLabel`, `mergeDescriptors`) and default to `unknown` taint when provenance is missing.
- **Phase 4 – Guard Directive Runtime**
  - `/guard` directives compile into registered thunks with deterministic evaluation order.
  - Guards fire for `import`, `command`, and `output` events; deny decisions block execution with clear errors.
  - Integration tests cover allow/deny scenarios across imports and commands.
- **Phase 5 – Secret Inference & Enforcement Modes**
  - Basic inference tags secrets and records provenance on descriptors.
  - `strict` rejects unlabeled declarations; `paranoid` defaults descriptors to `untrusted`.
  - Config schema and tests capture the new modes.
- **Phase 6 – Documentation, Tooling, and Rollout**
  - Docs, LSP tokens, and audit logging incorporate capability context.
  - Internal migration guidance enumerates the upgrade path.

## Guard Semantics
- Guards execute synchronously at defined checkpoints before side-effects occur (import resolution, command dispatch, output emission).
- Evaluation order matches registration order; deny decisions short-circuit remaining guards.
- Initial `GuardDecision` surface is `{ allow }` or `{ deny }`, reserving `prompt`/`retry` for later.
- Guard thunks receive immutable `CapabilityContext` snapshots; development builds assert against mutation.
- Guard failures raise `GuardError` instances with context for `AuditLogger`.
- Streaming output never begins before guard approval; denial yields no partial output.
- Guards are non-reentrant per event; thunks may call helpers but must not trigger nested guard evaluation.
- Capability metadata is populated prior to guard invocation so policies read consistent context.

## Taint Lattice
- Levels (highest risk to lowest): `llmOutput` > `networkLive` > `networkCached` > `resolver` > `userInput` > `commandOutput` > `localFile` > `staticEmbed` > `module` > `literal` > `unknown`.
- Merge rule: choose the highest-risk level present; upgrade `unknown` when a known level participates.
- Rationale:
  - LLM-generated content carries the highest injection risk.
  - Live network fetches outrank cached ones due to nondeterminism.
  - Registry/resolver content sits above raw user input but below general network sources when curated.
  - Static embeds and literals serve as safe baselines.
- Provide helpers: `compareTaintLevels`, `describeTaint`, and future `mergeDescriptors` usage to align runtime decisions.

## Legacy Trust/TTL Removal Checklist
- Scrub `trust`/`ttl` tokens from grammar (`grammar/**`).
- Remove trust fields from core types (`core/types/import.ts`, `core/types/values.ts`, `core/types/primitives.ts`, `VariableMetadata`).
- Delete trust/ttl config handling across loaders, defaults, and tests.
- Excise runtime trust logic from import evaluators, cache services, env flags, CLI options, approval prompts.
- Update docs (`docs/**`, `llms.txt`, samples) to drop references.
- Rewrite tests that depended on trust behaviour; add regression coverage ensuring old syntax errors clearly.
- Add CI automation (e.g., `rg "trust"`) to prevent regressions.

## Ownership & Deliverables
- Assign a primary “security import lead” through Phase 4 to shepherd grammar, runtime, and guard design.
- Maintain design references (`docs/dev/import-security-overview.md`) alongside implementation notes.
- Schedule a security review after Phase 4 to validate guard hooks and taint propagation.
- Record user-visible changes in `CHANGELOG.md` per release.
