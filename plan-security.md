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

## Phase 4.0 – Basic Guard Runtime

**Objective:**
Deliver core guard functionality: syntax, registration, invocation, and basic actions (allow/deny/retry).

**Scope:**
- Guard directive parsing: `/guard [@name] [for <label>] = when [...]`
- Guard registration and lookup by data label
- Guard invocation at directive boundaries (before execution)
- Actions: `allow`, `deny "reason"`, `retry "hint"` (auto-deny if not retryable)
- Context variables: `@ctx.input`, `@ctx.op`, `@ctx.labels`, `@ctx.tries`
- Data labels on `/exe` declarations (operation labels)
- Integration with existing pipeline retry infrastructure
- Retry capability checking (can source be retried?)

**Non-Goals:**
- Guard-based fixing (`allow @value`) - deferred to 4.1
- Domain/network detection - deferred to 4.1
- Schema validation helpers - deferred to 4.1
- Built-in guards - deferred to 4.1
- `prompt` action - deferred to Phase 5+

**Workstreams:**

1. **Grammar Extension**
   - Add `/guard` directive pattern to grammar
   - Support optional name: `/guard @name for label = when`
   - Support optional label filter: `/guard for secret = when`
   - Parse guard body as when-block with allow/deny/retry actions

2. **Guard Registration & Storage**
   - Create guard registry in Environment class
   - Register guards by label filter (`for secret`, `for pii`, etc)
   - Support anonymous guards (no name) and named guards
   - Allow multiple guards per label (evaluate in registration order)
   - First `deny` decision short-circuits remaining guards
   - Support guard export/import (guards are exportable entities)
   - Guards are execution-scoped (global within execution context)
   - Guards cannot be overridden (mlld immutability applies)

3. **Operation Labels on /exe**
   - Extend `/exe` grammar to accept optional labels
   - Store labels in executable metadata
   - Example: `/exe network,paid @fetchData() = ...`
   - Expose via `@ctx.op.labels` during guard evaluation

4. **Guard Invocation Infrastructure**
   - Instrument directives to check inputs for labels before execution
   - Directives: `/run`, `/show`, `/import`, `/output`, `/exe` (invocation)
   - For each directive, invoke guards AFTER inputs are evaluated, BEFORE operation executes
   - Build `@ctx.op` structure with directive-specific metadata
   - Populate `@ctx.input` with actual data value being guarded
   - Invoke matching guards with populated @ctx
   - Handle guard decisions: allow → continue, deny → throw GuardError, retry → delegate

5. **@ctx Population for Guards**
   - `@input` - actual data value(s) being guarded (primary, like pipeline stages)
   - `@ctx.input` - alias to @input (for consistency)
   - `@ctx.labels` - accumulated labels from all inputs
   - `@ctx.sources` - provenance tracking
   - `@ctx.op` - operation metadata with consistent structure:
     - `type`: directive type ("run", "show", "import", "output", "exec-invocation")
     - `labels`: implicit labels for built-ins, user-declared for /exe
     - Directive-specific fields (command, path, name, etc)
     - `domains`: extracted domains (Phase 4.1+)
   - `@ctx.tries` - retry attempt counter (in retry contexts)
   - Note: Rename runtime field from @ctx.operation to @ctx.op

6. **Retry Integration**
   - When guard returns `retry "hint"`, check if source is retryable (function call in pipeline)
   - If retryable: delegate to existing pipeline retry system
   - If not retryable: auto-deny with GuardError: "Cannot retry: {hint} (source not retryable)"
   - Explicit limitation: retry only works in pipeline contexts with function sources
   - Document limitation clearly in error messages and docs

7. **Testing**
   - Grammar tests for guard syntax variations
   - Registration tests (multiple guards per label, ordering)
   - Invocation tests (guards fire at right boundaries)
   - Decision tests (allow/deny/retry behaviors)
   - Integration tests with labeled /exe and directives
   - Retry tests in pipeline and non-pipeline contexts
   - Export/import tests for guards

8. **Guard Helper Functions**
   - Implement `@opIs(type)`, `@opHas(label)`, `@opHasAny([labels])`, `@opHasAll([labels])`
   - Implement `@inputHas(label)` - checks @ctx.labels.includes(label)
   - Helpers are available in guard when-blocks
   - Map to underlying @ctx checks (e.g., @opHas → @ctx.op.labels.includes)
   - Note: @input is accessible directly as a variable (like in pipeline stages)

**Deliverables:**
- Guard directive grammar and AST types
- Guard registration system in Environment
- GuardError type in core/errors (with label, decision, capabilityContext)
- Directive instrumentation (run, show, import, output, exec-invocation)
- @ctx population logic (rename operation → op)
- Guard helper functions (@opHas, @opIs, @opHasAny, @opHasAll, @inputHas)
- Guard export/import support
- Retry capability checking
- Test coverage for all guard actions and helpers

**Time Estimate:** 1-1.5 weeks

---

## Phase 4.1 – Guard Fixing & Network Detection

**Objective:**
Add guard-based data fixing, network activity detection, and schema validation helpers.

**Scope:**
- `allow @value` action for guard-based fixing
- Domain extraction from commands and imports
- `@ctx.op.domains` population
- Schema validation helper design and implementation
- Built-in guards (@secretProtection, @piiRestrictions, etc)

**Workstreams:**

1. **Allow with Value (Fixing)**
   - Extend `allow` action to accept optional value
   - Syntax: `allow @transformedValue`
   - When guard returns `allow @value`, replace @ctx.input with fixed value
   - Ensure fixed value propagates to operation correctly

2. **Network Activity Detection**
   - Implement domain extraction from commands (see below)
   - Populate `@ctx.op.domains` array
   - Support guards filtering on domains

3. **Domain Extraction Algorithm**
   - Tier 1: Protocol URLs (`https://`, `http://`, `ftp://`, `ssh://`, `git://`, `ws://`, `wss://`)
   - Tier 2: Network commands + domains (`curl api.com`, `wget example.com`, `ssh user@host.com`)
   - Tier 3: Git-style URLs (`git@github.com:user/repo`)
   - Tier 4: IP addresses (excluding private ranges: 192.168.x, 10.x, 127.x)
   - Common TLDs: `.com .org .net .io .dev .app .ai .co .edu .gov` + country codes
   - Network commands: curl, wget, ssh, git, rsync, scp, nc, netcat, ping, ftp, telnet

4. **Schema Validation Helpers**
   - Design API for `@matchesSchema(data, schema)` helper
   - Implement JSON schema validation
   - Support for common validation patterns
   - Error messages for validation failures

5. **Built-in Guards**
   - `@secretProtection` - prevent secrets in network/log/output
   - `@piiRestrictions` - prevent PII in logs
   - `@destructiveConfirmation` - prompt for destructive ops (requires Phase 5)
   - `@untrustedRestrictions` - block untrusted code execution

6. **Testing**
   - Domain extraction test suite (coverage of all patterns)
   - Allow-with-value tests (fixing data)
   - Schema validation tests
   - Built-in guard integration tests

**Deliverables:**
- `allow @value` implementation
- Domain extraction utility
- Schema validation helpers
- Built-in guard library
- Test coverage

**Time Estimate:** 1 week

## Phase 5 – Secret Inference, Enforcement Modes & Prompts
- Wire in a secret detection strategy for `typeInference: "basic"`, storing inference provenance on descriptors.
- Implement `strict` (reject missing labels) and `paranoid` (default untrusted) modes in config loading; ensure inference + explicit labels merge predictably.
- Add `prompt "message"` action with user Y/N/additional instruction
- User feedback flows through hint channel to retried operations
- Confirmation UI for destructive operations
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
- **Phase 4.0 – Basic Guard Runtime**
  - Parser accepts `/guard [@name] [for <label>] = when [...]` syntax
  - Guards register by label and can be looked up
  - Guards fire for import, run, show, output directives before execution
  - /exe accepts optional labels: `/exe network,paid @func() = ...`
  - Operation labels exposed via `@ctx.op.labels` (implicit for built-ins)
  - Implicit labels documented: /run has ["shell","external"], /show has ["output"], etc
  - Allow/deny decisions work correctly with clear GuardError messages
  - GuardError type exists with proper fields
  - Retry decisions delegate to existing pipeline retry system
  - Retry auto-denies if source not retryable with clear message
  - Guards can access `@ctx.input`, `@ctx.op`, `@ctx.labels`, `@ctx.tries`
  - Runtime field renamed from @ctx.operation to @ctx.op
  - Guard helpers work: @opHas, @opIs, @opHasAny, @opHasAll, @inputHas
  - Named guards can be exported and imported
  - Imported guards activate immediately
  - Integration tests cover allow/deny/retry scenarios
  - Tests cover retry in pipeline and non-pipeline contexts
  - Tests cover guard export/import

- **Phase 4.1 – Guard Fixing & Network Detection**
  - `allow @value` works for guard-based fixing
  - Domain extraction detects 95%+ of network commands
  - `@ctx.op.domains` populated correctly
  - Schema validation helpers work with guards
  - Built-in guards function as expected
  - Test coverage for domain detection edge cases
- **Phase 5 – Secret Inference & Enforcement Modes**
  - Basic inference tags secrets and records provenance on descriptors.
  - `strict` rejects unlabeled declarations; `paranoid` defaults descriptors to `untrusted`.
  - Config schema and tests capture the new modes.
- **Phase 6 – Documentation, Tooling, and Rollout**
  - Docs, LSP tokens, and audit logging incorporate capability context.
  - Internal migration guidance enumerates the upgrade path.

## Guard Semantics
- Guards execute synchronously at directive boundaries BEFORE operations execute
- Guards are invoked BY directives (e.g., /run, /show, /import), not as separate checkpoints
- Directives check their inputs for labels, then invoke matching guards
- Guards receive populated @ctx with both data (@ctx.input) and pending operation (@ctx.op)
- Evaluation order matches registration order; `deny` decisions short-circuit remaining guards
- Guards can see forward-looking operation info (@ctx.op describes what's ABOUT to happen)
- `retry` decisions delegate to existing pipeline retry infrastructure
- `retry` auto-denies if source is not retryable (with GuardError message)
- Guard failures raise `GuardError` instances with context for `AuditLogger`
- Guards are non-reentrant per directive invocation
- Guards are execution-scoped (apply globally within execution context)
- Guards cannot be overridden (mlld immutability applies)

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
