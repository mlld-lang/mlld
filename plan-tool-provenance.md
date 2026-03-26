# Plan: Tool Provenance, Audit UUIDs, Guard History, and Dynamic MCP Tool Collections

## Overview

This plan covers the remaining implementation work described in [spec-tool-provenance.md](./spec-tool-provenance.md): audit-log UUIDs and `toolCall` events, descriptor-level tool provenance, guard access via `@mx.tools.history`, and dynamic `var tools @t = mcp @expr` syntax. It assumes the native label-propagation fix is already in place and builds on that runtime behavior rather than replacing it.

Scope is limited to the function/exe tool path used by normal `exe` calls and native function-tool routing. The boxed built-in workspace/VFS tool path is explicitly out of scope. Spec Phase 4 (`mcpServers`) is already shipped and is not part of the implementation plan except where docs need to reference it.

Every implementation phase below has a hard gate: add tests for that phase first or in the same change, run the targeted suite, then run the full suite, and do not continue to the next phase until everything is green.

## Must-Read References

- [spec-tool-provenance.md](./spec-tool-provenance.md)
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [docs/dev/DOCS.md](./docs/dev/DOCS.md)
- [core/types/security.ts](./core/types/security.ts)
- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
- [cli/mcp/FunctionRouter.ts](./cli/mcp/FunctionRouter.ts)
- [interpreter/env/ContextManager.ts](./interpreter/env/ContextManager.ts)
- [interpreter/eval/var/rhs-dispatcher.ts](./interpreter/eval/var/rhs-dispatcher.ts)
- [interpreter/eval/import/McpImportService.ts](./interpreter/eval/import/McpImportService.ts)
- [interpreter/mcp/McpImportManager.ts](./interpreter/mcp/McpImportManager.ts)

## Current State

- Native tool-call label propagation already works for the function/exe tool bridge, but only through labels/taint and sources.
- `SecurityDescriptor` has no tool lineage field. `VariableContext`, structured values, and guard snapshots therefore cannot expose per-value tool history.
- `@mx.tools.calls` exists today, but it is execution-level history, not value-level provenance.
- The audit ledger records writes and label events but does not record tool invocations or event UUIDs.
- `var tools` currently accepts object literals only, even though the MCP import path already supports dynamic server specs through interpolation in `import tools from mcp "..."`

## Design Decisions

### Locked Decisions

1. **Audit UUID generation happens before execution, audit write happens after execution.**
   - Pre-generate the UUID in the exec path before the tool body runs.
   - Use that UUID immediately in the result descriptor's `ToolProvenance` entry.
   - Write the `toolCall` audit event after execution finishes, when duration/result/error are known.
   - This avoids blocking descriptor construction on audit I/O and avoids the timing tangle in the original spec.

2. **`ToolProvenance.args` stores param names only.**
   - Never store values, truncated values, or serialized arg payloads in the descriptor.
   - Full args belong only in the audit log.

3. **`exec-invocation.ts` owns `toolCall` audit events.**
   - `FunctionRouter` internally calls `evaluateExecInvocation`.
   - That means exec-invocation-level logging covers both direct exec calls and native function-tool routing.
   - `FunctionRouter` must not emit duplicate `toolCall` audit events.
   - If a router-level event is ever needed, it must be a different event type with a different purpose.

4. **Per-operation provenance aggregation stays local to guard code.**
   - Do not widen general-purpose array helper APIs just to carry tool lineage.
   - Keep aggregation in `guard-operation-keys.ts` unless implementation uncovers a strong reuse case.

5. **Dynamic MCP tool collections bypass `normalizeToolCollection`.**
   - Auto-generated MCP tools do not need `bind`, `expose`, or `controlArgs`.
   - The dynamic MCP branch should construct the final `ToolCollection` directly.
   - The object-literal `var tools = { ... }` path continues to use existing normalization.

6. **Dynamic `var tools = mcp @expr` is cleaner syntax, not a new backend capability.**
   - The import path already supports dynamic MCP specs via interpolation.
   - Phase 5 mainly exposes that capability through cleaner language-level syntax and tool-collection ergonomics.

7. **Built-in workspace/VFS tools remain out of scope.**
   - They use a different execution bridge and should not be folded into this rollout.

## Phase 0 - Baseline and Contract Freeze (≈0.5 day)

**Goal**: Lock the implementation contracts and establish the phase gate process before touching runtime code.

### Tasks

1. Confirm and record the locked decisions above in this plan and, if needed, mirror them into [spec-tool-provenance.md](./spec-tool-provenance.md).
2. Identify the existing baseline tests for the affected subsystems:
   - `cli/mcp/FunctionRouter.test.ts`
   - `interpreter/eval/import/mcp-import.test.ts`
   - `interpreter/eval/tools-collection.test.ts`
   - `interpreter/eval/var/rhs-dispatcher.test.ts`
   - `tests/interpreter/security-metadata.test.ts`
3. Create a small command checklist in the implementation branch notes for targeted runs plus the full-suite gate.

### Testing

- Run the current targeted baseline for the affected subsystems.
- Run `npm test` once to establish a clean baseline before phase work starts.

### Exit Criteria

- [ ] Locked decisions are written down and agreed.
- [ ] Baseline tests identified.
- [ ] `npm test` passes before Phase 1 begins.

**Deliverable**: The implementation contracts and test gates are frozen.

## Phase 1 - Audit UUIDs and `toolCall` Events (≈1 day)

**Goal**: Every mlld audit event gets a UUID, and every exe/tool invocation produces a first-class `toolCall` audit record.

### Tasks

1. **Audit event schema** - `core/security/AuditLogger.ts`
   - Add `id` to `AuditEvent`.
   - Add `tool`, `args`, `resultLength`, `duration`, and `ok`.
   - Change `appendAuditEvent()` to return the generated UUID.
   - Preserve additive compatibility for all existing callers.

2. **Tool-call audit helper** - `interpreter/utils/audit-log.ts`
   - Add `logToolCallEvent()` that writes `toolCall` events with args, labels, taint, sources, duration, and result summary.
   - Keep file-write logging unchanged except for the new returned UUID behavior.

3. **Exec-path integration** - `interpreter/eval/exec-invocation.ts`
   - Pre-generate a tool audit UUID before execution begins.
   - Capture timing around the execution body.
   - Write the `toolCall` audit event after execution succeeds or fails.
   - Keep existing `env.recordToolCall()` behavior.
   - Do not block later provenance work on post-hoc audit reads.

4. **Router boundary** - `cli/mcp/FunctionRouter.ts`
   - Ensure router-owned native tool calls do not emit duplicate `toolCall` audit events.
   - Keep `recordToolCall()` and conversation-descriptor behavior intact.

### Tests To Add

1. Unit coverage for audit schema changes.
   - New `core/security/AuditLogger.test.ts` or equivalent extension of the current audit tests.
   - Verify returned UUIDs, written `id` fields, and `toolCall` event payload shape.

2. Runtime coverage for tool-call audit writes.
   - Extend `tests/interpreter/security-metadata.test.ts` or add a focused interpreter audit test.
   - Verify a tool invocation writes `toolCall` to `.mlld/sec/audit.jsonl`.

3. Fixture coverage per [docs/dev/TESTS.md](./docs/dev/TESTS.md).
   - Add a fixture under `tests/cases/security/` that performs a tool call and then reads `<@root/.mlld/sec/audit.jsonl>` back to assert the ledger content.
   - Keep support file names globally unique if any are added.

### Testing

- Run the new audit-focused unit tests.
- Run the affected interpreter/runtime suites.
- Run `npm test`.

### Exit Criteria

- [ ] Every new audit record includes `id`.
- [ ] `toolCall` events are written for exe/tool invocations.
- [ ] No duplicate `toolCall` events for native function-tool routing.
- [ ] New unit and fixture coverage exists for audit behavior.
- [ ] `npm test` passes before Phase 2 begins.

**Deliverable**: Audit ledger UUIDs and `toolCall` events are live and covered by tests.

## Phase 2 - Descriptor-Level Tool Provenance (≈1.5 days)

**Goal**: Tool lineage becomes part of `SecurityDescriptor` and survives normal value propagation, merges, serialization, and wrapping.

### Tasks

1. **Descriptor schema** - `core/types/security.ts`
   - Add `ToolProvenance`.
   - Add `tools?: readonly ToolProvenance[]` to `SecurityDescriptor` and serialized forms.
   - Update create, normalize, merge, serialize, and deserialize logic.
   - Preserve insertion order and dedup by `auditRef`.

2. **Value-carrier plumbing**
   - `core/types/variable/VariableTypes.ts`
   - `core/types/variable/VarMxHelpers.ts`
   - `core/types/variable/VariableMetadata.ts`
   - `interpreter/utils/structured-value.ts`
   - `interpreter/eval/var/security-descriptor.ts`
   - Add `tools` to mx/metadata extraction and flattening paths.
   - Ensure `varMxToSecurityDescriptor()` and `extractSecurityDescriptor()` both round-trip provenance.

3. **Exec result provenance injection** - `interpreter/eval/exec-invocation.ts`
   - Use the pre-generated audit UUID from Phase 1.
   - Build a `ToolProvenance` entry for the current tool call using the tool name and param names only.
   - Merge it with any input-carried provenance.
   - Apply the merged descriptor to the final wrapped result value.

4. **Router compatibility** - `cli/mcp/FunctionRouter.ts`
   - Keep the existing conversation-descriptor chaining intact.
   - Ensure native tool-call result descriptors retain upstream provenance plus the current tool call.

### Tests To Add

1. Descriptor unit tests.
   - Add a new test file for `core/types/security.ts` or extend existing security-type tests.
   - Verify merge order, `auditRef` dedup, serialization, and deserialization.

2. Value-carrier tests.
   - Extend `tests/interpreter/security-metadata.test.ts`.
   - Verify provenance survives structured wrapping, variable mx snapshots, and direct descriptor extraction.

3. Runtime provenance tests.
   - Extend `cli/mcp/FunctionRouter.test.ts` and/or add exec-invocation-focused tests.
   - Verify `toolA -> toolB` yields lineage `[toolA, toolB]` on the final result.

4. Fixture coverage.
   - Add a fixture under `tests/cases/security/` that performs a multi-tool pipeline and shows the resulting `.mx.tools` or equivalent surfaced lineage.

### Testing

- Run the new descriptor and metadata tests.
- Run the native tool/router regression tests.
- Run `npm test`.

### Exit Criteria

- [ ] `SecurityDescriptor.tools` exists and round-trips everywhere descriptors travel.
- [ ] Result values carry cumulative tool lineage.
- [ ] `ToolProvenance.args` contains param names only.
- [ ] New unit and fixture coverage exists for descriptor propagation.
- [ ] `npm test` passes before Phase 3 begins.

**Deliverable**: Tool provenance is part of value security metadata, not just the audit ledger.

## Phase 3 - Guard Access via `@mx.tools.history` (≈1 day)

**Goal**: Guards can inspect value-level tool provenance through `@mx.tools.history` without changing the meaning of existing execution-level `@mx.tools.calls`.

### Tasks

1. **Per-input capture** - `interpreter/hooks/guard-candidate-selection.ts`
   - Add provenance capture from `variable.mx.tools`.
   - Carry it on `PerInputCandidate`.

2. **Per-operation aggregation** - `interpreter/hooks/guard-operation-keys.ts`
   - Add a local provenance aggregation helper.
   - Merge all input lineage into `OperationSnapshot`.
   - Keep this local to guard code.

3. **Guard context surface**
   - `interpreter/hooks/guard-runtime-evaluator.ts`
   - `interpreter/env/ContextManager.ts`
   - `interpreter/hooks/guard-context-snapshot.ts`
   - Thread lineage into `GuardContextSnapshot`.
   - Expose `@mx.tools.history` alongside the existing `calls`, `allowed`, `denied`, and `results`.

4. **Scope discipline**
   - Do not change quantifier helpers or add `@input.any.mx.tools` in this phase.
   - Keep `history` focused on guard-time value provenance.

### Tests To Add

1. Guard runtime tests.
   - Add or extend tests around `ContextManager` and guard runtime evaluation.
   - Verify `@mx.tools.history` is empty when no lineage exists and populated when lineage exists.

2. Router + guard integration tests.
   - Extend `cli/mcp/FunctionRouter.test.ts` or add a dedicated guard integration test.
   - Verify native tool calling sees prior tool results in `@mx.tools.history`.

3. Fixture coverage.
   - Add fixtures under `tests/cases/security/` for:
     - deny when required verifier is absent from `@mx.tools.history`
     - allow when verifier is present
     - multi-tool chain visibility on the final guarded value

4. Regression coverage.
   - Keep explicit tests proving `@mx.tools.calls` still means execution-level call history.

### Testing

- Run the guard/runtime suites.
- Run the new security fixtures.
- Run `npm test`.

### Exit Criteria

- [ ] `@mx.tools.history` is available in guard context.
- [ ] Existing `@mx.tools.calls` behavior is unchanged.
- [ ] New fixtures exercise value-level provenance rather than just session-level call history.
- [ ] `npm test` passes before any Phase 5 work begins.

**Deliverable**: Guards can reason about where the current value came from, not just what tools were called somewhere in the execution.

## Spec Phase 4 - Already Implemented

`mcpServers` is already shipped and should not block the remaining work. No new implementation is planned here beyond ensuring docs stay accurate where they mention dynamic MCP server resolution.

## Phase 5 - Dynamic `var tools @t = mcp @expr` (≈1 day)

**Goal**: Allow tool collections to be created directly from an MCP server spec resolved at runtime.

### Tasks

1. **Grammar and AST**
   - `grammar/patterns/var-rhs.peggy`
   - `grammar/directives/var.peggy`
   - `core/types/var.ts`
   - `core/types/primitives.ts` if the new node enters a shared union
   - Add an `mcpToolSource` RHS node for `mcp @expr`.
   - Ensure var normalization preserves it cleanly.

2. **RHS evaluation**
   - `interpreter/eval/var/rhs-dispatcher.ts`
   - Evaluate the expression to a string spec.
   - Call `McpImportManager.listTools(spec)`.
   - Build the final `ToolCollection` directly from `McpImportService.createMcpToolVariable()`.
   - Do not send this branch through `normalizeToolCollection`.

3. **Var validation and finalization**
   - `interpreter/eval/var.ts`
   - Allow `var tools` to accept either an object literal or the new dynamic MCP source node.
   - Skip normalization for the dynamic-MCP branch if the dispatcher already returned a final `ToolCollection`.

4. **Parser regeneration**
   - Run `npm run build:grammar:core`.
   - Commit generated parser artifacts if they are part of the normal source tree for grammar changes.

5. **Motivation cleanup**
   - Update the spec/docs wording to note that dynamic MCP specs already existed via interpolation in `import tools from mcp "..."`; this phase provides cleaner `var tools` syntax and direct tool-collection ergonomics.

### Tests To Add

1. Parser/dispatcher unit tests.
   - Extend `interpreter/eval/var/rhs-dispatcher.test.ts` for the new node type.
   - Verify non-string spec rejection.

2. Tool-collection runtime tests.
   - Extend `interpreter/eval/tools-collection.test.ts`.
   - Verify `var tools @t = mcp @payload.cmd` creates a valid collection.

3. MCP integration tests.
   - Extend `interpreter/eval/import/mcp-import.test.ts` or add a sibling integration test.
   - Verify runtime-resolved MCP specs work and server lifecycle is cleaned up.

4. Fixture coverage.
   - Add fixtures under `tests/cases/feat/` or `tests/cases/integration/` for:
     - dynamic MCP tool collection creation
     - labels on the `var tools` declaration
     - parallel execution isolation if a deterministic fixture can express it

### Testing

- Run `npm run build:grammar:core`.
- Run the new parser/runtime suites.
- Run the new fixture coverage.
- Run `npm test`.

### Exit Criteria

- [ ] `var tools @t = mcp @expr` parses.
- [ ] The runtime builds a usable tool collection directly from MCP schema discovery.
- [ ] The dynamic branch does not rely on object-literal normalization.
- [ ] Grammar artifacts are regenerated and committed as required.
- [ ] `npm test` passes before the docs/final sweep begins.

**Deliverable**: Dynamic MCP-backed tool collections work as first-class `var tools` syntax.

## Phase 6 - Docs, Fixtures, and Final Hardening (≈1 day)

**Goal**: Update user docs, refresh generated doc fixtures, and finish with a clean build and green test suite.

### Required `docs/src/atoms` Updates

1. `docs/src/atoms/security/10-audit-log--basics.md`
   - Document `id` on audit events.
   - Add `toolCall` to the mlld audit ledger event table.
   - Clarify tool-call event fields and the separation between ledger payload and descriptor provenance.

2. `docs/src/atoms/security/11-audit-log--tool-call-tracking.md`
   - Distinguish execution-level `@mx.tools.calls` from value-level `@mx.tools.history`.
   - Add examples showing when to use each.

3. `docs/src/atoms/security/05-mcp-security--basics.md`
   - Clarify that `src:mcp` remains the source-taint layer while tool provenance is a separate chain.
   - Mention that provenance persists across derived values.

4. `docs/src/atoms/security/07-mcp-security--guards.md`
   - Add guard examples using `@mx.tools.history`.
   - Clarify when `@mx.taint` is sufficient and when value-level tool history is the correct primitive.

5. `docs/src/atoms/mcp/03-mcp--tool-collections.md`
   - Document `var tools @t = mcp @expr`.
   - Clarify that this path creates a collection from discovered MCP tools, not from an object literal.

6. `docs/src/atoms/mcp/05-mcp--import.md`
   - Note that dynamic server specs already existed through interpolation.
   - Explain how `var tools = mcp @expr` differs from `import tools from mcp "..."`

### Strongly Recommended Follow-On Atom Updates

1. `docs/src/atoms/security/12-patterns--audit-guard.md`
   - Migrate examples that really mean value provenance from `@mx.tools.calls.includes("verify")` to `@mx.tools.history`.

2. `docs/src/atoms/security/13-patterns--airlock.md`
   - Same migration where the example is expressing lineage on the guarded value rather than raw session call history.

3. `docs/src/atoms/security/04-signing--autosign-autoverify.md`
   - Clarify whether the current `verify` enforcement example should remain execution-level (`calls`) or be re-expressed with lineage semantics.

4. `docs/src/atoms/security/_index.md`
   - Refresh the section summary to mention audit event IDs, `toolCall`, and `@mx.tools.history`.

### Tasks

1. Update the atoms listed above.
2. Rebuild generated fixtures with `npm run build:fixtures`.
3. If execution-backed doc expectations are added or changed, use `npm run doc:expect -- <doc>/<hash>` as needed.
4. Update `CHANGELOG.md` for the user-visible behavior changes.
5. Update [spec-tool-provenance.md](./spec-tool-provenance.md) if implementation diverged from the original wording and this spec remains the design source of truth.

### Testing

- Run `npm run build:fixtures`.
- Run any affected doc expectation capture commands if required.
- Run `npm test`.
- Run `npm run build`.

### Exit Criteria

- [ ] Required atoms are updated.
- [ ] Generated documentation fixtures are refreshed and committed.
- [ ] `CHANGELOG.md` reflects the shipped behavior.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.

**Deliverable**: Runtime, tests, docs, fixtures, and build outputs are consistent.

## Phase Dependencies

- Phase 1 -> Phase 2 -> Phase 3 are sequential and should land together if practical.
- Spec Phase 4 is already complete and independent.
- Phase 5 is largely independent of Phases 1-3 and can be done after them in a separate PR.
- Phase 6 happens after all code phases and should not be skipped.

## Testing Policy for This Work

This work must follow [docs/dev/TESTS.md](./docs/dev/TESTS.md):

- Add tests in each phase, not at the end.
- Prefer focused unit tests for local logic and fixtures for user-visible behavior.
- When file effects are involved, read the generated files back through the virtual filesystem in fixtures.
- Keep support filenames globally unique across fixtures.
- If a docs atom changes, rebuild doc fixtures with `npm run build:fixtures`.

### Phase Gate Rule

Do not start the next phase until:

- [ ] The current phase's new tests are committed or ready in the branch
- [ ] The current phase's targeted suites pass
- [ ] `npm test` passes
- [ ] Any required grammar/doc generated artifacts are rebuilt and committed

## Overall Exit Criteria

### Test Status

- [ ] Every phase added new coverage
- [ ] `npm test` is green at the end of every phase
- [ ] Final `npm test` is green
- [ ] Final `npm run build` is green

### Documentation

- [ ] Required atoms in `docs/src/atoms/` are updated
- [ ] Generated doc fixtures are rebuilt
- [ ] `CHANGELOG.md` is updated
- [ ] `spec-tool-provenance.md` is updated if it remains normative

### Validation

- [ ] Audit ledger shows `toolCall` events with stable UUIDs
- [ ] Result values expose descriptor-level tool provenance
- [ ] Guards can use `@mx.tools.history`
- [ ] Dynamic `var tools = mcp @expr` works with runtime-resolved MCP specs
- [ ] Built-in workspace/VFS tools remain unaffected

## Suggested PR Breakdown

1. PR 1: Phase 1 + Phase 2 + Phase 3
   - Audit UUIDs
   - Descriptor provenance
   - Guard history

2. PR 2: Phase 5
   - Dynamic MCP-backed `var tools`
   - Grammar regeneration

3. PR 3: Phase 6
   - Docs atoms
   - Fixture refresh
   - Changelog/spec cleanup
