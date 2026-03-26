# Plan: Policy Audit Mode

## Overview

This plan covers implementation of the feature described in [../evals/spec-policy-audit-mode.md](../evals/spec-policy-audit-mode.md): `policy { audit: true }` and `policy { audit: @var }` should evaluate the active policy, record what would have been denied, and allow execution to continue.

The main technical constraint is that policy enforcement is not centralized. Label-flow checks, policy-generated guards, capability denials, filesystem policy, keychain policy, and shell-block policy checks all deny through different paths today. The plan therefore starts with a Phase 0 research spike that freezes the contracts and identifies every enforcement surface before any runtime changes land.

Initial scope assumes audit visibility through `@mx.policy.audits` and `.mlld/sec/audit.jsonl`. Adding a new SDK/result-level `audits` field is explicitly deferred unless Phase 0 shows the eval harness needs it.

## Must-Read References

- [../evals/spec-policy-audit-mode.md](../evals/spec-policy-audit-mode.md)
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [docs/dev/DOCS.md](./docs/dev/DOCS.md)
- [core/policy/union.ts](./core/policy/union.ts)
- [interpreter/policy/PolicyEnforcer.ts](./interpreter/policy/PolicyEnforcer.ts)
- [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
- [interpreter/hooks/guard-decision-reducer.ts](./interpreter/hooks/guard-decision-reducer.ts)
- [interpreter/eval/exec/guard-policy.ts](./interpreter/eval/exec/guard-policy.ts)
- [interpreter/eval/run-modules/run-policy-context.ts](./interpreter/eval/run-modules/run-policy-context.ts)
- [interpreter/policy/filesystem-policy.ts](./interpreter/policy/filesystem-policy.ts)
- [interpreter/policy/keychain-policy.ts](./interpreter/policy/keychain-policy.ts)
- [interpreter/env/ContextManager.ts](./interpreter/env/ContextManager.ts)
- [core/types/security.ts](./core/types/security.ts)
- [core/security/AuditLogger.ts](./core/security/AuditLogger.ts)

## Current State

- `/policy` already evaluates normal object expressions, so `audit: @audit` is parser-compatible without grammar work.
- `PolicyConfig` has no `audit` field today, and policy merge/normalize logic has no concept of audit-vs-enforce.
- Direct label-flow denial is handled by `PolicyEnforcer.checkLabelFlow(...)` and used by show/output/append/directive/pipeline/exec/content-loader paths.
- Policy defaults and explicit label rules also run through the guard pipeline via synthetic policy guards in `generatePolicyGuards(...)` and `guard-pre-hook.ts`.
- Capability denials are split out: command/capability exec checks, `/run` checks, filesystem checks, keychain checks, and shell-block checks all throw directly today.
- `@mx.policy` currently comes from the ambient security snapshot. That same policy context is also copied into `SecurityDescriptor.policyContext`, so storing audits there would make them propagate and merge through normal values.
- Structured execution results currently expose `denials`, not a general-purpose audit stream.

## Design Decisions

### Locked Decisions

1. `policy.audit` is a boolean policy field with dynamic expression support through existing `/policy` object evaluation.
2. `policy.audit` merge semantics are override-style, not sticky. An incoming policy fragment can explicitly turn audit on or off.
3. Audit mode means policy evaluation still runs, but policy denials become structured audit records instead of hard denials.
4. User guards keep normal behavior in audit mode. Only policy-owned denials are converted to audit records.
5. Audit records live in ambient runtime context and audit log output, not in `SecurityDescriptor.policyContext`.
6. `@mx.policy.audits` is the primary in-script access surface.
7. `.mlld/sec/audit.jsonl` receives additive `policy-audit` entries for durable inspection.
8. SDK/result-level `audits` exposure is deferred pending Phase 0 findings.

### Open Questions To Resolve In Phase 0

1. Should audit records be flattened into the existing root `ContextManager`, or kept on `Environment` and injected into `@mx` at render time?
2. What exact record shape is sufficient for the spec and stable enough for tests?
3. Which direct capability-denial sites should audit-and-continue versus remain enforcing even in audit mode, if any?
4. Is any host-side result surface beyond `@mx.policy.audits` and audit.jsonl required for the eval workflow?

## Phase 0 - Enforcement Inventory and Contract Freeze (≈0.5-1 day)

**Goal**: Reduce implementation risk by enumerating all policy denial paths, freezing audit semantics, and choosing the runtime storage surface before touching enforcement code.

### Tasks

1. **Inventory every policy deny path**
   - Trace all current policy denials in:
     - [interpreter/policy/PolicyEnforcer.ts](./interpreter/policy/PolicyEnforcer.ts)
     - [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
     - [interpreter/eval/exec/guard-policy.ts](./interpreter/eval/exec/guard-policy.ts)
     - [interpreter/eval/run-modules/run-policy-context.ts](./interpreter/eval/run-modules/run-policy-context.ts)
     - [interpreter/policy/filesystem-policy.ts](./interpreter/policy/filesystem-policy.ts)
     - [interpreter/policy/keychain-policy.ts](./interpreter/policy/keychain-policy.ts)
     - [interpreter/env/Environment.ts](./interpreter/env/Environment.ts) shell-block path
   - Classify each site as:
     - `audit-and-continue`
     - `still-enforce`
     - `covered indirectly by another path`

2. **Freeze override semantics**
   - Validate how unlocked policy denies are currently overridden by privileged allows in:
     - [interpreter/hooks/guard-decision-reducer.ts](./interpreter/hooks/guard-decision-reducer.ts)
     - [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
     - [interpreter/hooks/guard-runtime-evaluator.ts](./interpreter/hooks/guard-runtime-evaluator.ts)
   - Decide the final audit payload for:
     - plain would-deny
     - would-deny then overridden
     - authorization-specific override

3. **Freeze `@mx`/runtime storage design**
   - Validate that audits must not live in `SecurityDescriptor.policyContext`.
   - Choose a concrete storage seam in:
     - [interpreter/env/ContextManager.ts](./interpreter/env/ContextManager.ts)
     - [core/types/security.ts](./core/types/security.ts)
     - [interpreter/env/VariableManager.ts](./interpreter/env/VariableManager.ts)

4. **Freeze audit record shape**
   - Define a minimal `PolicyAuditRecord` contract with:
     - policy name
     - rule
     - operation
     - input labels / taint
     - operation labels
     - reason
     - preview or args summary where safe
     - outcome (`would-deny`, `overridden`, `authorized-override`)

5. **Decide result-surface scope**
   - Determine whether Phase 1-5 stop at `@mx.policy.audits` + audit.jsonl, or whether SDK/result surfaces must also change.

### Testing

- Run the current baseline suites for the affected subsystems before implementation:
  - policy directive / union tests
  - guard pre-hook tests
  - policy command exec tests
  - policy label-flow tests
  - filesystem policy tests
  - keychain policy tests
- Run `npm test` once as a baseline gate.

### Exit Criteria

- [ ] Every policy deny path is classified.
- [ ] Audit semantics for override cases are written down.
- [ ] The `@mx.policy.audits` storage approach is frozen.
- [ ] The `PolicyAuditRecord` payload is frozen.
- [ ] Scope decision made on SDK/result-level `audits`.
- [ ] Baseline `npm test` passes before Phase 1 begins.

**Deliverable**: A frozen implementation contract that removes the major ambiguity and regression risk.

## Phase 1 - Policy Model and Audit Runtime Plumbing (≈0.5-1 day)

**Goal**: Add `policy.audit` to the model and create runtime storage/logging primitives for audit records.

### Tasks

1. **PolicyConfig support** - [core/policy/union.ts](./core/policy/union.ts)
   - Add `audit?: boolean` to `PolicyConfig`.
   - Normalize it to strict boolean semantics.
   - Add merge behavior with explicit override semantics.

2. **Policy analysis surfacing** - [cli/commands/analyze.ts](./cli/commands/analyze.ts)
   - Surface `audit` in extracted policy metadata when statically known.

3. **Runtime audit store**
   - Add audit-record accumulation to [interpreter/env/ContextManager.ts](./interpreter/env/ContextManager.ts) or the finalized Phase 0 storage seam.
   - Expose audits through ambient `@mx.policy.audits`.

4. **Audit log helper**
   - Extend [core/security/AuditLogger.ts](./core/security/AuditLogger.ts) for additive `policy-audit` events.
   - Add a focused helper in [interpreter/utils/audit-log.ts](./interpreter/utils/audit-log.ts) for policy audit writes.

### Testing

- Add unit tests for policy normalize/merge behavior.
- Add `ContextManager` or equivalent tests for audit storage and ambient exposure.
- Run targeted analyze/policy tests.

### Exit Criteria

- [ ] `policy.audit` normalizes and merges correctly.
- [ ] Audit records can be accumulated at runtime.
- [ ] `@mx.policy.audits` is available without contaminating security descriptors.
- [ ] `policy-audit` events can be written to audit.jsonl.

## Phase 2 - Direct Label-Flow Audit Mode (≈1 day)

**Goal**: Convert direct `PolicyEnforcer.checkLabelFlow(...)` denials into audit records when audit mode is on.

### Tasks

1. **Audit-aware enforcer** - [interpreter/policy/PolicyEnforcer.ts](./interpreter/policy/PolicyEnforcer.ts)
   - On deny + `policy.audit === true`, record audit and return instead of throwing.
   - Preserve normal deny behavior when audit is false.

2. **Cover existing enforcer call sites**
   - Validate behavior through existing users in:
     - [interpreter/eval/directive.ts](./interpreter/eval/directive.ts)
     - [interpreter/eval/show/shared-helpers.ts](./interpreter/eval/show/shared-helpers.ts)
     - [interpreter/eval/output.ts](./interpreter/eval/output.ts)
     - [interpreter/eval/append.ts](./interpreter/eval/append.ts)
     - [interpreter/eval/pipeline/command-execution/preflight/policy-preflight.ts](./interpreter/eval/pipeline/command-execution/preflight/policy-preflight.ts)
     - [interpreter/eval/exec/guard-policy.ts](./interpreter/eval/exec/guard-policy.ts) param-flow helpers

### Testing

- Add direct unit tests around `PolicyEnforcer`.
- Add integration coverage for:
  - show blocked in enforce mode, allowed in audit mode
  - append/output blocked in enforce mode, allowed in audit mode
  - dynamic `audit: @audit` from `@payload`

### Exit Criteria

- [ ] Direct label-flow denial sites audit-and-continue when enabled.
- [ ] Normal enforce mode behavior is unchanged.
- [ ] `@mx.policy.audits` includes direct label-flow records.

## Phase 3 - Policy Guard Audit Mode and Override Visibility (≈1-1.5 days)

**Goal**: Convert policy-generated guard denials into audit records while preserving visibility into privileged and authorization overrides.

### Tasks

1. **Audit-aware policy guard handling** - [interpreter/hooks/guard-pre-hook.ts](./interpreter/hooks/guard-pre-hook.ts)
   - Record policy deny guard results from the full trace.
   - Exclude policy deny results from final enforcement when audit mode is on.
   - Keep user guard deny/retry behavior unchanged.

2. **Override outcome recording**
   - Capture when a policy deny would have fired but a privileged/authorization allow wins.
   - Reflect the agreed Phase 0 outcome in the audit record.

3. **Authorization path coverage**
   - Ensure `policy.authorizations` denials also become audit records in audit mode.

### Testing

- Extend:
  - [tests/interpreter/hooks/guard-pre-hook.test.ts](./tests/interpreter/hooks/guard-pre-hook.test.ts)
  - [tests/interpreter/hooks/guard-decision-reducer.test.ts](./tests/interpreter/hooks/guard-decision-reducer.test.ts)
  - [interpreter/eval/tools-collection.test.ts](./interpreter/eval/tools-collection.test.ts)
- Add cases for:
  - unlocked policy deny + privileged allow
  - locked policy deny still enforcing
  - authorization deny in enforce vs audit mode

### Exit Criteria

- [ ] Policy-generated guard denials audit instead of block when enabled.
- [ ] User guards still enforce.
- [ ] Override cases are visible in audit records.
- [ ] Locked-policy semantics remain unchanged.

## Phase 4 - Direct Capability, Filesystem, Keychain, and Shell Paths (≈1 day)

**Goal**: Cover policy deny sites that bypass `PolicyEnforcer` and bypass the policy guard reducer.

### Tasks

1. **Exec and `/run` capability paths**
   - Update:
     - [interpreter/eval/exec/guard-policy.ts](./interpreter/eval/exec/guard-policy.ts)
     - [interpreter/eval/run-modules/run-policy-context.ts](./interpreter/eval/run-modules/run-policy-context.ts)

2. **Filesystem / integrity / keychain**
   - Update:
     - [interpreter/policy/filesystem-policy.ts](./interpreter/policy/filesystem-policy.ts)
     - [interpreter/policy/keychain-policy.ts](./interpreter/policy/keychain-policy.ts)

3. **Shell-block path**
   - Update the `findDeniedShellCommand(...)` deny path in [interpreter/env/Environment.ts](./interpreter/env/Environment.ts).

4. **Shared helper extraction if needed**
   - If multiple sites need the same “record audit and continue” behavior, extract a common helper rather than duplicating payload shaping.

### Testing

- Extend:
  - [tests/integration/policy-command-exec.test.ts](./tests/integration/policy-command-exec.test.ts)
  - filesystem policy tests
  - keychain policy tests
- Add audit-mode variants showing execution continues and audits are captured.

### Exit Criteria

- [ ] Direct command/capability deny sites honor audit mode.
- [ ] Filesystem and keychain policy denials honor audit mode where Phase 0 classified them as auditable.
- [ ] Shell-block denial path honors audit mode.

## Phase 5 - Fixtures, Docs, and Release Surface (≈0.5-1 day)

**Goal**: Finalize user-facing behavior, documentation, and release notes.

### Tasks

1. **Fixture coverage**
   - Add fixture tests under `tests/cases/security/` that:
     - read `@mx.policy.audits`
     - read `.mlld/sec/audit.jsonl`
     - verify dynamic `audit: @audit` via payload

2. **User docs**
   - Update relevant atoms:
     - [docs/src/atoms/config/04-policy--basics.md](./docs/src/atoms/config/04-policy--basics.md)
     - [docs/src/atoms/config/08-policy--composition.md](./docs/src/atoms/config/08-policy--composition.md)
     - [docs/src/atoms/security/10-audit-log--basics.md](./docs/src/atoms/security/10-audit-log--basics.md)
     - [docs/src/atoms/security/01-security-getting-started.md](./docs/src/atoms/security/01-security-getting-started.md)
     - [docs/src/atoms/sdk/06-sdk--payload.md](./docs/src/atoms/sdk/06-sdk--payload.md)

3. **Changelog**
   - Add an entry to [CHANGELOG.md](./CHANGELOG.md).

4. **Optional SDK/result work**
   - Only if Phase 0 requires it, add `audits` to structured results and SDK layers.

### Testing

- Run targeted fixture and doc-related tests.
- Run `npm run build:fixtures`.
- Run `npm test`.
- Run `npm run build`.

### Exit Criteria

- [ ] Fixtures cover the shipped audit-mode behavior.
- [ ] User docs describe audit mode and dynamic audit toggling.
- [ ] CHANGELOG entry added.
- [ ] Full test suite passes.
- [ ] Build succeeds.

## Testing Requirements

- New unit coverage for:
  - policy normalize/merge semantics
  - audit record storage
  - audit-aware `PolicyEnforcer`
- New regression coverage for:
  - direct label-flow deny sites
  - policy guard deny sites
  - privileged override visibility
  - authorization audit behavior
  - capability/filesystem/keychain audit behavior
- New fixtures for:
  - `@mx.policy.audits`
  - audit.jsonl `policy-audit` records
  - `audit: @audit` host-controlled mode

## Documentation Requirements

- Update atoms for policy basics, composition, audit log behavior, and SDK payload-driven configuration.
- Rebuild doc fixtures after doc changes.
- Add a changelog entry for the shipped user-visible behavior.

## Overall Exit Criteria

- [ ] Phase 0 contracts are frozen before runtime changes.
- [ ] `policy.audit` works with literals and dynamic values.
- [ ] Policy evaluation still runs fully in audit mode.
- [ ] Policy denials are visible via `@mx.policy.audits`.
- [ ] Durable audit records are written to `.mlld/sec/audit.jsonl`.
- [ ] Normal enforce mode behavior is unchanged.
- [ ] Locked policy semantics and user-guard semantics are preserved.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
