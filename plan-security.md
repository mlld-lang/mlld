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

## Phase 1 – Import-Type Grammar & Runtime _(completed - main branch)_
- Extend `/import` grammar and supporting patterns to parse explicit import type keywords (`module`, `static`, `live`, `cached`, `local`). Remove all TTL/trust grammar.
- Update AST (`core/types/import.ts`, `core/types/values.ts`, directive nodes) to include `importType?: ImportType`, leaving data labels undefined for now.
- Refactor runtime import resolution (`ImportPathResolver`, `ImportDirectiveEvaluator`, `ImportSecurityValidator`) to honour the five import types, adjust resolver behaviour, and replace TTL-based caching with explicit duration metadata for `cached`.
- Regenerate parser artifacts and update parser/interpreter tests to confirm the new import behaviour and absence of TTL parsing.
- Update docs/tests to reflect the new import syntax; no data labels or guards yet. Ensure any tests that relied on trust/TTL stubs are rewritten or removed (e.g., integration/modules fixture already updated).
- Optional: retire the legacy `/path` directive in favor of import capabilities once core updates land.

## Phase 2 – Security Descriptor Foundations _(completed - datalabels branch)_
- Implement final types in `core/types/security.ts`: `DataLabel`, `SecurityDescriptor`, helper utilities, and `CapabilityContext` shapes.
- Extend grammar and AST nodes to parse optional data labels on `/import`, `/var`, `/exe`, `/run`, `/show`.
- Adjust `VariableMetadata` and `VariableFactories` to accept and store `SecurityDescriptor` placeholders (without taint merge logic yet).
- Add unit tests ensuring labels parse correctly and propagate into AST nodes.
- ✅ **Status**: Grammar parses labels, types are implemented, tests pass (tests/core/security-descriptor.test.ts, tests/grammar/security-labels.test.ts)

## Phase 3 – Taint Tracking & Metadata Propagation _(completed - datalabels branch)_

**See `plan-security-phase-3.md` for detailed implementation.**

**Summary of completed work:**
- Taint tracking primitives in `core/security/taint.ts` with TaintTracker, helpers, and taint lattice
- Environment security subsystem with push/pop security context, descriptor merging
- Directive evaluators (`/var`, `/import`, `/run`, `/show`) build and propagate SecurityDescriptors
- Pipeline integration threading descriptors through stages
- Serialization for module import/export
- Tests: `tests/core/security-descriptor.test.ts`, `tests/grammar/security-labels.test.ts`, `tests/interpreter/security-metadata.test.ts`

**Current implementation:**
- Security context managed via Environment push/pop stack
- Descriptor merging happens in individual directive evaluators
- @ctx population in VariableManager

**Known gaps from Phase 3:**
- `/exe` evaluator lacks security integration
- Interpolation doesn't merge descriptors from embedded variables
- Some test coverage gaps

## Phase 3.5 – Hook Architecture & Refactoring _(next - implements spec-hooks.md)_

**Objective:**
Implement evaluation hook infrastructure, fill Phase 3 gaps, and refactor existing taint tracking to use hooks, preparing for Phase 4 guards. Security hooks consist of two built-in components: the guard pre-hook (policy enforcement before execution) and the taint post-hook (descriptor propagation after execution).

**Part A: Fix Phase 3 Gaps (3-5 days)**
- Fix `/exe` evaluator security integration
- Fix exec invocation label propagation
- Fix template interpolation descriptor merging
- Fix `/export` and `/output` evaluator security integration
- Add comprehensive test coverage for all fixes

**Part B: Hook Infrastructure (3-5 days)**
- Implement `HookManager` class (see `spec-hooks.md`)
- Add pre/post hook registration and execution in a fixed order (guard pre-hook → directive execution → taint post-hook), with additional diagnostics/profiling hooks appended later but still interpreter-controlled
- Integrate hook execution in `evaluateDirective()`
- Implement `extractDirectiveInputs()` helper for directive-specific input extraction
- Implement lightweight `ContextManager` that manages `@ctx.op`, `@ctx.pipe`, and `@ctx.guard` stacks, exposing helper methods the Environment delegates to (per `spec-hooks.md` and Phase 3.5 plan)
- Test infrastructure with no-op hooks (ensure no behavioral changes or performance regression)

**Part C: Context Manager & Variable .ctx (1 week)**
- Extend the `ContextManager` helper so Environment-scoped utilities (`withOpContext`, `withPipeContext`, `withGuardContext`) push/pop namespace data and emit backward-compatible aliases (`@ctx.operation`, `@ctx.try`, etc.)
- **Implement variable `.ctx` namespace** for metadata access:
  - Security metadata: `.ctx.labels`, `.ctx.taint`, `.ctx.source`
  - Lazy computed: `.ctx.tokens`, `.ctx.length`, `.ctx.type`, `.ctx.size`
  - Introspection: `.ctx.name`, `.ctx.defined`, `.ctx.exported`
  - Array semantics: accessing `.ctx` on arrays flattens/merges results
- Update field access evaluator to support `.ctx.*` paths
- Add lazy evaluation and caching for computed properties
- Test variable metadata access across all variable types

**Part D: Taint Tracking Migration to Hooks (1-2 weeks)**
- **Migrate existing taint tracking** from evaluator-based to hook-based approach
- Move descriptor merging logic from individual evaluators into centralized taint post-hook
- Remove `pushSecurityContext`/`popSecurityContext` calls from evaluators (replaced by hooks)
- Taint post-hook runs after directive execution, updates `result.ctx.labels`, `result.ctx.taint`, `result.ctx.source`
- Refactor tests to validate hook-based propagation
- **Reorganize @ctx namespaces**: @ctx.op.*, @ctx.pipe.*, @ctx.guard.* (maintain backward compat with aliases)

**Time estimate:** 3-4 weeks total

## Phase 4.0 – Basic Guard Runtime

**Objective:**
Deliver core guard functionality: syntax, registration, hook implementation, and basic actions (allow/deny/retry).

**Scope:**
- Guard directive parsing: `/guard [@name] for <filter> = when [...]`
- Guard filter types: `for <data-label>` (per-input) and `for op:<type>` (per-operation)
- Guard registration and lookup by filter
- **Guards as pre-execution hooks** (not directive-by-directive instrumentation)
- Actions: `allow`, `deny "reason"`, `retry "hint"` (auto-deny if not retryable)
- Context variables: `@input`, `@ctx.op`, `@ctx.guard.try`, `@ctx.guard.max`
- Data labels on `/exe` declarations (operation labels)
- Integration with existing pipeline retry infrastructure (reuse `RetryContext`)
- Retry capability checking (can source be retried?)
- Directives covered: `/run`, `/show`, `/import`, `/var`, `/exe` (invocation)

**Non-Goals:**
- `/output` directive guard support - deferred to Phase 7.1
- Guard-based fixing (`allow @value`) - deferred to 4.1
- Domain/network detection - deferred to 4.1
- Schema validation helpers - deferred to 4.1
- Built-in guards - deferred to 4.1
- `prompt` action - deferred to Phase 7.2
- Non-pipeline retry - deferred to Phase 7.3

**Workstreams:**

1. **Grammar Extension**
   - Add `/guard` directive pattern to grammar
   - Support optional name: `/guard @name for filter = when`
   - **Require filter** (no overbroad guards): `for secret`, `for op:run`, `for op:cmd`, etc.
   - Parse guard body as when-block with allow/deny/retry actions
   - Parse operation type filters with execution context: `op:cmd`, `op:sh`, `op:js`, `op:node`, `op:py`

2. **Guard Registration & Storage**
   - Create guard registry in Environment class
   - Register guards by filter type:
     - Data guards: `for <data-label>` (per-input trigger)
     - Operation guards: `for op:<type>` (per-operation trigger)
   - Support anonymous guards (no name) and named guards
   - Allow multiple guards per filter (evaluate in registration order)
   - First `deny` decision short-circuits remaining guards
   - Support guard export/import (guards are exportable entities)
   - Guards are execution-scoped (global within execution context)
   - Guards cannot be overridden (mlld immutability applies)

3. **Operation Labels on /exe**
   - Extend `/exe` grammar to accept optional labels
   - Store labels in executable metadata
   - Example: `/exe network,paid @fetchData() = ...`
   - Expose via `@ctx.op.labels` during guard evaluation

4. **Guard Hook Implementation**
   - **Implement guards as pre-execution hooks** (see `spec-hooks.md`)
   - Guard hook executes in `evaluateDirective()` before dispatching to specific evaluators
   - Extract directive inputs once, pass to hooks
   - Per-input guards: iterate over inputs, fire guard for each matching label
   - Per-operation guards: fire once with all inputs as array
   - Build `@ctx.op` structure with directive-specific metadata and execution context type
   - Populate `@input` and `@ctx.guard.*` for guard evaluation
   - Handle guard decisions: allow → continue, deny → throw GuardError, retry → create retry context
   - First denial short-circuits (no further guards checked)

5. **@ctx Population for Guards**
   - `@input` - actual data value being guarded (single value for per-input, array for per-operation)
   - `@ctx.input` - alias to @input (for consistency)
   - `@ctx.labels` - accumulated labels (per-input: same as @input.ctx.labels)
   - `@ctx.sources` - provenance tracking
   - `@ctx.op` - operation metadata with consistent structure:
     - `type`: execution context type ("op:cmd", "op:sh", "op:js", "op:node", etc.) or directive type
     - `labels`: implicit labels for built-ins, user-declared for /exe
     - Directive-specific fields (command, path, name, etc)
     - `domains`: extracted domains (Phase 4.1+)
   - `@ctx.guard.try` - guard retry attempt number (uses pipeline retry infrastructure)
   - `@ctx.guard.tries` - array of previous retry results
   - `@ctx.guard.max` - maximum retry limit (default: 3)
   - Note: Reorganize runtime @ctx into namespaces (@ctx.pipe.*, @ctx.guard.*, @ctx.op.*)

6. **Retry Integration**
   - When guard returns `retry "hint"`, create retry context using pipeline infrastructure
   - Retry context tracks `attemptNumber` (surfaced as `@ctx.guard.try`)
   - Check if input source is retryable before allowing retry
   - If retryable: increment retry context, re-evaluate inputs, loop again
   - If not retryable: auto-deny with GuardError: "Cannot retry: {hint} (source not retryable)"
   - Retry limits managed by retry context (max 3 by default)
   - Each guard evaluation point gets fresh retry context (independent of pipeline retries)

7. **Testing**
   - Grammar tests for guard syntax variations
   - Registration tests (multiple guards per label, ordering)
   - Invocation tests (guards fire at right boundaries)
   - Decision tests (allow/deny/retry behaviors)
   - Integration tests with labeled /exe and directives
   - Retry tests in pipeline and non-pipeline contexts
   - Export/import tests for guards

8. **Array Helpers for Per-Operation Guards**
   - When `@input` is an array (per-operation guards), provide helpers:
     - `@input.any.ctx.labels.includes(label)` - ANY input has label
     - `@input.all.ctx.labels.includes(label)` - ALL inputs have label
     - `@input.none.ctx.labels.includes(label)` - NONE have label
   - Aggregate methods:
     - `@input.totalTokens()` - sum of all token counts
     - `@input.maxTokens()` - maximum token count
   - Default array `.ctx` access returns flattened/merged results
   - Specific input access: `@input[0].ctx.labels`

**Deliverables:**
- Guard directive grammar and AST types
- Guard registration system in Environment (per-input and per-operation scopes)
- GuardError type in core/errors (with label, decision, capabilityContext)
- **Guard hook implementation** (pre-execution hook, not directive instrumentation)
- Hook integration in `evaluateDirective()`
- @ctx namespace reorganization (@ctx.op.*, @ctx.guard.*, @ctx.pipe.*)
- Execution context types in @ctx.op (op:cmd, op:sh, op:js, op:node, op:py)
- Array helper methods for per-operation guards (@input.any, @input.all, @input.none)
- Guard export/import support
- Retry integration using pipeline `RetryContext`
- Test coverage for all guard actions, both trigger scopes, and array helpers
- Covers: `/run`, `/show`, `/import`, `/var`, `/exe` (NOT `/output` - deferred to Phase 7.1)

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

## Phase 6 – Documentation, Tooling, and Rollout _(future)_
- Update developer/user docs, `/guard` guide, and `llms.txt` with the new capability model (present tense only).
- Adjust LSP semantic token rules and tests to highlight import types and labels.
- Ensure `AuditLogger` records capability context for CaMeL-style audits.
- Publish migration guidance (internal) explaining manual upgrade steps.
- Record user-visible changes in `CHANGELOG.md` per release.

## Phase 7 – Deferred Enhancements _(future)_

**Features punted from earlier phases for later consideration:**

### 7.1 - Output Directive Guard Support
- Guard integration for `/output` directive
- File effect metadata in @ctx.op.target
- Guards can check output destinations and file paths
- Example: prevent secrets from being written to public directories
- Required: file effect metadata tracking in effect emission system

### 7.2 - Prompt Action in Guards
- `prompt "message"` action for user confirmation
- Interactive Y/N/provide-instruction flow in CLI
- User feedback flows through hint channel to retried operations
- CLI integration for prompts with retry support
- Example: confirm destructive operations before execution

### 7.3 - Non-Pipeline Guard Retry
- Guards can retry outside pipeline contexts
- Track variable provenance to enable retry of non-pipeline sources
- Support retrying direct invocations: `/show @result` where @result came from function
- Requires: enhanced provenance tracking beyond current pipeline infrastructure
- Example: guard retries `/var @x = @claude()` even without pipeline

### 7.4 - Advanced Guard Features
- Guard composition (guards calling other guards)
- Conditional guard activation (enable/disable guards based on runtime context)
- Guard debugging mode (`MLLD_DEBUG_GUARDS=true`) with verbose output
- Guard performance metrics and profiling
- Schema validation guard enhancements
- Guard testing utilities and fixtures

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
- **Phase 3 – Taint Tracking & Metadata Propagation** _(completed - datalabels branch)_
  - TaintTracker in `core/security/taint.ts` with taint lattice and helpers
  - Environment security subsystem with context push/pop and descriptor merging
  - Directive evaluators build and propagate SecurityDescriptors
  - Pipeline integration with descriptor threading
  - Module export/import preserves descriptors
  - Tests: security-descriptor.test.ts, security-labels.test.ts, security-metadata.test.ts
  - See `plan-security-phase-3.md` for full implementation details

- **Phase 3.5 – Hook Architecture & Refactoring** _(next phase)_
  - **Part A**: Phase 3 gaps filled - `/exe`, exec invocation, interpolation, `/export`, `/output` have security integration
  - **Part A**: Comprehensive test coverage for gap fixes
  - **Part B**: Hook infrastructure (`HookManager`) in place with no behavioral changes
  - **Part B**: Pre/post hooks registered in hardcoded order (not user-configurable)
  - **Part B**: Hook execution integrated in `evaluateDirective()`
  - **Part B**: ContextManager (or Environment methods) for @ctx namespace management
  - **Part B**: No performance regression when no hooks registered
  - **Part C**: Variable `.ctx` namespace works on all variable types
  - **Part C**: Security metadata accessible: `.ctx.labels`, `.ctx.taint`, `.ctx.source`
  - **Part C**: Lazy properties compute correctly: `.ctx.tokens`, `.ctx.length`, `.ctx.type`
  - **Part C**: Array `.ctx` access flattens/merges results; `@array[0].ctx` accesses specific element
  - **Part D**: Taint tracking refactored to post-hook
  - **Part D**: Descriptor merging centralized in taint post-hook (removed from evaluators)
  - **Part D**: @ctx reorganized into namespaces (@ctx.op.*, @ctx.pipe.*, @ctx.guard.*) with backward compat
- **Phase 4.0 – Basic Guard Runtime**
  - Parser accepts `/guard [@name] for <filter> = when [...]` syntax with required filter
  - Guards support two trigger scopes: per-input (`for <data-label>`) and per-operation (`for op:<type>`)
  - Operation type filters include execution contexts: `op:cmd`, `op:sh`, `op:js`, `op:node`, `op:py`
  - Guard registry supports both data guards and operation guards
  - **Guards implemented as pre-execution hooks** in `evaluateDirective()`
  - Hook system extracts inputs and invokes guards before directive execution
  - Per-input guards fire individually for each labeled input
  - Per-operation guards fire once with all inputs as array
  - /exe accepts optional labels: `/exe network,paid @func() = ...`
  - @ctx.op includes execution context type (op:cmd, op:js, etc.) and labels
  - Allow/deny/retry decisions work correctly with clear GuardError messages
  - GuardError type exists with proper fields
  - Retry creates retry context using pipeline `RetryContext` infrastructure
  - `@ctx.guard.try` increments with each retry (independent of `@ctx.pipe.try`)
  - Retry auto-denies if source not retryable with clear message
  - Guards can access `@input`, `@ctx.op`, `@ctx.guard.try`, `@ctx.guard.max`
  - Array helpers work for per-operation guards: `@input.any`, `@input.all`, `@input.none`
  - Named guards can be exported and imported
  - Imported guards activate immediately
  - Integration tests cover allow/deny/retry scenarios for both trigger scopes
  - Tests cover retry with RetryContext integration
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
- Guards execute as **pre-execution hooks** at directive boundaries BEFORE operations execute
- Hook system extracts directive inputs, collects labels, and invokes matching guards
- **Per-input guards** (data guards) fire individually for each labeled input (`@input` is single value)
- **Per-operation guards** fire once per directive with all inputs as array (`@input` is array)
- Guards receive populated @ctx with data (`@input`) and pending operation (`@ctx.op`)
- Evaluation order matches registration order; `deny` decisions short-circuit remaining guards
- Guards see forward-looking operation info (@ctx.op describes what's ABOUT to happen)
- `retry` decisions create retry contexts using pipeline infrastructure (`RetryContext`)
- `@ctx.guard.try` tracks retry attempts (independent of pipeline `@ctx.pipe.try`)
- `retry` auto-denies if source is not retryable (with GuardError message)
- Each guard evaluation point has independent retry budget (resets per directive)
- Guard failures raise `GuardError` instances with context for `AuditLogger`
- Guards are non-reentrant per directive invocation
- Guards are execution-scoped (apply globally within execution context)
- Guards cannot be overridden (mlld immutability applies)
- All guards must have filters (no overbroad guards allowed)

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
