# Plan: Agent Authorization Permissions

## Overview

This plan implements [spec-agent-authorization-permissions.md](./spec-agent-authorization-permissions.md): static `policy.authorizations.authorizable` permissions by role, framework-managed worker authorization, auto-injected `<authorization_notes>`, immutable role identity from exe labels, and the required validator, LSP, regex-highlighting, docs, fixture, and test updates needed to ship the feature cleanly.

The implementation must keep `@policy.build` and the existing authorization compiler intact as the bucketed-intent engine. The new behavior belongs at the policy-model boundary and the framework dispatch boundary, not as a back-compat expansion of builder/runtime authorizations.

Every phase below has the same hard gate: the phase is not complete until its targeted tests pass and `npm test` is green.

## Must-Read References

- [spec-agent-authorization-permissions.md](./spec-agent-authorization-permissions.md)
- [docs/dev/ANTI-SLOP.md](./docs/dev/ANTI-SLOP.md)
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [docs/dev/LANGUAGE-SERVER.md](./docs/dev/LANGUAGE-SERVER.md)
- [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy)
- [grammar/patterns/data-values.peggy](./grammar/patterns/data-values.peggy)
- [grammar/patterns/security.peggy](./grammar/patterns/security.peggy)
- [grammar/syntax-generator/build-syntax.js](./grammar/syntax-generator/build-syntax.js)
- [core/policy/authorizations.ts](./core/policy/authorizations.ts)
- [core/policy/union.ts](./core/policy/union.ts)
- [core/validation/policy-call.ts](./core/validation/policy-call.ts)
- [cli/commands/analyze.ts](./cli/commands/analyze.ts)
- [cli/commands/analyze.policy-declarations.test.ts](./cli/commands/analyze.policy-declarations.test.ts)
- [interpreter/policy/authorization-compiler.ts](./interpreter/policy/authorization-compiler.ts)
- [interpreter/env/builtins/policy.ts](./interpreter/env/builtins/policy.ts)
- [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
- [interpreter/eval/exec/tool-metadata.ts](./interpreter/eval/exec/tool-metadata.ts)
- [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
- [interpreter/eval/exec/scoped-runtime-config.ts](./interpreter/eval/exec/scoped-runtime-config.ts)
- [interpreter/eval/exec/code-handler.ts](./interpreter/eval/exec/code-handler.ts)
- [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts)
- [interpreter/env/executors/function-mcp-bridge.ts](./interpreter/env/executors/function-mcp-bridge.ts)
- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
- [interpreter/fyi/tool-docs.ts](./interpreter/fyi/tool-docs.ts)
- [interpreter/shelf/shelf-notes.ts](./interpreter/shelf/shelf-notes.ts)
- [services/lsp/ASTSemanticVisitor.ts](./services/lsp/ASTSemanticVisitor.ts)
- [services/lsp/visitors/DirectiveVisitor.ts](./services/lsp/visitors/DirectiveVisitor.ts)
- [services/lsp/visitors/StructureVisitor.ts](./services/lsp/visitors/StructureVisitor.ts)
- [tests/utils/token-validator/TokenCoverageValidator.ts](./tests/utils/token-validator/TokenCoverageValidator.ts)
- [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md)
- [docs/src/atoms/config/15-tool-docs.md](./docs/src/atoms/config/15-tool-docs.md)
- [docs/src/atoms/patterns/04-planner.md](./docs/src/atoms/patterns/04-planner.md)
- [docs/src/atoms/security/_index.md](./docs/src/atoms/security/_index.md)
- [docs/src/atoms/security/01-security-getting-started.md](./docs/src/atoms/security/01-security-getting-started.md)
- [docs/src/atoms/core/14-exe--metadata.md](./docs/src/atoms/core/14-exe--metadata.md)
- [docs/src/atoms/cli/03-validate.md](./docs/src/atoms/cli/03-validate.md)

## Current State and Integration Points

- Generic object keys still use `PropertyKey = BaseIdentifier | DataString` in [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy), so `policy.authorizations.authorizable: { role:planner: [...] }` is not a legal unquoted plain-object shape today.
- `role:*` already exists as a shared label concept in [grammar/patterns/security.peggy](./grammar/patterns/security.peggy), and record-display syntax already has dedicated support elsewhere. The new policy object path should reuse one canonical colon-bearing key rule rather than inventing another one-off parser shape.
- Runtime role/display are already separate in practice:
  - exe labels are stored in [interpreter/eval/exec/code-handler.ts](./interpreter/eval/exec/code-handler.ts) and [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
  - scoped display overrides are resolved independently in [interpreter/eval/exec/scoped-runtime-config.ts](./interpreter/eval/exec/scoped-runtime-config.ts)
  - `@mx.llm.display` comes from the scoped display path, not from mutable role state
- `PolicyAuthorizations` in [core/policy/authorizations.ts](./core/policy/authorizations.ts) only models `allow` and `deny`. That shape is merged in [core/policy/union.ts](./core/policy/union.ts), normalized in [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts), and evaluated at runtime as dispatch policy.
- The builder/compiler path in [interpreter/env/builtins/policy.ts](./interpreter/env/builtins/policy.ts) and [interpreter/policy/authorization-compiler.ts](./interpreter/policy/authorization-compiler.ts) still rejects unrecognized bucket fields. That is correct and should stay correct. The framework must strip or isolate `authorizable`; the builder should not learn a second contract.
- Tool-note injection currently flows through [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts), [interpreter/fyi/tool-docs.ts](./interpreter/fyi/tool-docs.ts), and [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts). Shelf notes are appended afterward. Existing tests already lock note ordering.
- Function-tool exposure and allowed-tool narrowing live in [interpreter/env/executors/function-mcp-bridge.ts](./interpreter/env/executors/function-mcp-bridge.ts), [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts), and [interpreter/env/Environment.ts](./interpreter/env/Environment.ts).
- Docs currently describe the old planner-auth flow in several places, especially [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md), [docs/src/atoms/config/15-tool-docs.md](./docs/src/atoms/config/15-tool-docs.md), and [docs/src/atoms/patterns/04-planner.md](./docs/src/atoms/patterns/04-planner.md).
- LSP and regex-highlighting obligations are explicit in [docs/dev/LANGUAGE-SERVER.md](./docs/dev/LANGUAGE-SERVER.md): semantic-token tests, regex tests, `npm run test:tokens`, and `npm run validate:tokens` all need to stay green when syntax changes.

## Goals

1. Make `policy.authorizations.authorizable` a real, statically validated policy feature with `role:*` keys.
2. Keep role identity immutable and derived only from exe `role:*` labels.
3. Keep display shaping separate and overridable without affecting authorization.
4. Let the framework, not the worker, check `authorizable`, narrow the worker tool set, call `@policy.build`, and apply the compiled policy.
5. Add `<authorization_notes>` using the same tool-doc rendering path as `<tool_notes>`.
6. Update validator/analyze, docs, fixtures, LSP, regex highlighting, and all affected tests with no compatibility shims.

## Non-Goals and Locked Decisions

- No `privileged` exe label for this feature.
- No `src:privileged` provenance path.
- No aliasing such as `planner` for `role:planner`.
- No “callable tools are implicitly authorizable” fallback.
- No teaching `@policy.build` or `authorization-compiler` to accept `authorizable` as bucketed intent.
- No merge support for `authorizable` in `with { policy }`.
- No duplicate tool-doc rendering path for authorization notes.
- No defensive duck-typing around typed AST/policy structures when a proper type can be added.

## Concerns to Resolve Early

1. **Canonical tool identity for `authorizable`**
   Source syntax in the spec uses exe refs (`[@sendEmail]`), but runtime authorization today matches surfaced tool identities and collection keys. Phase 0 must lock one normalization rule and reuse it everywhere.

2. **Exact note ordering**
   Existing tests already lock `user system -> <tool_notes> -> <shelf_notes>`. Adding `<authorization_notes>` needs one explicit ordering contract and corresponding tests.

3. **Base-only vs runtime-merged policy shape**
   The source syntax keeps `authorizable` inside `policy.authorizations`, but runtime merged authorizations must remain `allow`/`deny` only. The internal normalized model needs one clean split that preserves the source contract without leaking `authorizable` into dispatch policy.

## Phase 0 - Freeze the Contract and Shared Normalization

**Goal**: lock the semantics that every later phase depends on, and extract the shared normalization helpers instead of re-deriving them in each layer.

### Tasks

1. Lock the canonical mapping from developer-declared `authorizable` entries to runtime tool identity.
2. Lock the exact source contract:
   - source policy shape keeps `authorizable` under `policy.authorizations`
   - normalized runtime dispatch policy does not
3. Add shared helpers for:
   - `role:*` key recognition
   - caller-role extraction from exe labels only
   - `authorizable` role-key normalization
   - tool identity normalization for authorization permissions
4. Lock `<authorization_notes>` ordering relative to `<tool_notes>` and `<shelf_notes>`.
5. Lock how tools with no effective `controlArgs` behave inside `authorizable` validation: no silent special casing later.

### Testing

- Add focused unit coverage for the shared helper module(s) if they are non-trivial.
- Add characterization tests for note ordering if phase 0 introduces a dedicated helper.

### Exit Criteria

- [ ] The role/tool normalization rules are codified in shared helpers and used by more than one surface.
- [ ] The internal split between source `authorizable` metadata and runtime dispatch authorizations is decided and documented in code/tests.
- [ ] The `<authorization_notes>` ordering contract is frozen in tests.
- [ ] `npm test` passes.

## Phase 1 - Grammar and Policy Model Foundation

**Goal**: make the source syntax and typed policy model capable of expressing the spec cleanly.

### Tasks

1. Update generic object-key parsing so `authorizable: { role:planner: [...] }` is legal without quotes.
   - Primary files: [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy), [grammar/patterns/data-values.peggy](./grammar/patterns/data-values.peggy), and shared token helpers if needed.
   - Reuse a single colon-bearing identifier rule instead of copy-pasting record-display parsing.
2. Extend policy types so base policy declarations can carry `authorizable` metadata without pretending it is runtime `PolicyAuthorizations`.
   - Primary files: [core/policy/authorizations.ts](./core/policy/authorizations.ts), [core/policy/union.ts](./core/policy/union.ts)
3. Add explicit typed accessors/helpers for immutable authorization role lookup from exe labels.
   - Primary file: [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
4. Do not add parser/runtime aliases for bare `planner` or `worker`.

### Testing

- Add grammar tests for plain policy objects containing `role:planner` keys.
- Add type/normalization unit tests for the new base-policy authorizable model.
- Add env tests proving caller-role extraction comes only from exe labels, not from scoped display overrides.

### Exit Criteria

- [ ] Unquoted `role:*` keys work in plain policy objects.
- [ ] Base policy types can represent `authorizable` without polluting runtime dispatch authorizations.
- [ ] Caller-role lookup is a first-class typed helper.
- [ ] `npm test` passes.

## Phase 2 - Static Validation and Analyze Support

**Goal**: teach validate/analyze about `authorizable` as a base-policy feature and reject misuse on the intent/runtime-policy side.

### Tasks

1. Extend static policy validation to understand `policy.authorizations.authorizable`.
   - Validate `role:*` keys.
   - Validate referenced tools against trusted tool context.
   - Detect conflicts with `authorizations.deny`.
   - Detect duplicate or unresolvable tool identities after normalization.
2. Keep `authorizable` out of planner-produced bucketed intent.
   - Static literal intent containing `authorizable` should be diagnosed, even though the framework strips it defensively at runtime boundaries.
3. Keep `authorizable` out of `with { policy }` merge semantics.
   - Static policy-fragment validation should reject or strip-with-diagnostic; do not silently bless it as a supported runtime fragment.
4. Update analyze output and diagnostics so policy declarations and builder/validate calls surface the new problems cleanly.
   - Primary files: [core/policy/authorizations.ts](./core/policy/authorizations.ts), [core/validation/policy-call.ts](./core/validation/policy-call.ts), [cli/commands/analyze.ts](./cli/commands/analyze.ts)
5. If phase 0 decides on warnings for authorizable tools without control args, implement that here.

### Testing

- Extend [cli/commands/analyze.policy-declarations.test.ts](./cli/commands/analyze.policy-declarations.test.ts) with valid and invalid `authorizable` declarations.
- Extend [cli/commands/analyze.test.ts](./cli/commands/analyze.test.ts) for builder/validate misuse cases.
- Add or extend unit tests under [core/policy/authorizations.test.ts](./core/policy/authorizations.test.ts) and [core/validation/policy-call.ts](./core/validation/policy-call.ts) coverage for role keys, deny conflicts, and unknown-tool handling.

### Exit Criteria

- [ ] `mlld validate` and `mlld analyze` understand valid `authorizable` declarations.
- [ ] Invalid `authorizable` declarations and invalid intent/runtime-policy uses are diagnosed.
- [ ] No static path treats `authorizable` as mergeable runtime authorization state.
- [ ] `npm test` passes.

## Phase 3 - Runtime Authorization Permissions and Worker Dispatch

**Goal**: enforce `authorizable` at the framework boundary while keeping `@policy.build` unchanged internally.

### Tasks

1. Split base-policy `authorizable` metadata from runtime dispatch authorizations in normalization/merge paths.
   - Primary files: [core/policy/union.ts](./core/policy/union.ts), [interpreter/eval/exec/policy-fragment.ts](./interpreter/eval/exec/policy-fragment.ts)
2. Keep builder/compiler behavior strict.
   - The builder still compiles bucketed intent only.
   - The framework strips `authorizable` from incoming intent before invoking builder logic.
   - Primary files: [interpreter/env/builtins/policy.ts](./interpreter/env/builtins/policy.ts), [interpreter/policy/authorization-compiler.ts](./interpreter/policy/authorization-compiler.ts)
3. Enforce authorization permissions at the worker-dispatch boundary.
   - Read caller role from exe labels only.
   - Resolve the authorizable tool set for that role.
   - Check deny before build.
   - Narrow the worker tool set to the authorized subset.
   - Apply the compiled policy to the worker environment without exposing it to the worker as a user variable.
   - Primary files: [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts), [interpreter/env/executors/function-mcp-bridge.ts](./interpreter/env/executors/function-mcp-bridge.ts), [interpreter/env/Environment.ts](./interpreter/env/Environment.ts)
4. Preserve the role/display split at runtime.
   - Display overrides may still shape projected outputs.
   - Display overrides must not change the authorization role.
5. Ensure `allowedTools` and surfaced tool metadata stay aligned with the dynamically narrowed worker tool set.

### Testing

- Extend [interpreter/eval/exec/policy-builder.test.ts](./interpreter/eval/exec/policy-builder.test.ts) only where framework-boundary stripping needs direct coverage.
- Extend [interpreter/eval/exec/policy-fragment.test.ts](./interpreter/eval/exec/policy-fragment.test.ts) for non-mergeability of `authorizable`.
- Extend [interpreter/env/executors/function-mcp-bridge.test.ts](./interpreter/env/executors/function-mcp-bridge.test.ts) and [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts) for worker-tool narrowing and deny handling.
- Extend [interpreter/eval/tools-collection.test.ts](./interpreter/eval/tools-collection.test.ts) for surfaced-name/collection-key behavior if phase 0 maps refs to surfaced identities.
- Add tests proving `with { display: "role:worker" }` on a planner call does not change what it can authorize.

### Exit Criteria

- [ ] Runtime dispatch checks `authorizable` before calling the builder.
- [ ] The worker only receives the authorized tool subset.
- [ ] The compiled policy is applied architecturally, not exposed as worker data.
- [ ] Display overrides do not affect authorization identity.
- [ ] `npm test` passes.

## Phase 4 - Tool Docs and `<authorization_notes>`

**Goal**: generate planner authorization docs from the same tool metadata/rendering path as existing tool docs, with explicit runtime injection behavior.

### Tasks

1. Extend tool-doc rendering to support an authorization-only surface derived from `authorizable` for the active role.
   - Primary files: [interpreter/fyi/tool-docs.ts](./interpreter/fyi/tool-docs.ts), [interpreter/eval/exec/tool-metadata.ts](./interpreter/eval/exec/tool-metadata.ts)
2. Add `<authorization_notes>` as a distinct injected block.
   - Do not overload `<tool_notes>`.
   - Include the spec’s bridge guidance for how to express authorization intent.
3. Inject the new block in the locked order from phase 0.
   - Primary files: [interpreter/env/executors/call-mcp-config.ts](./interpreter/env/executors/call-mcp-config.ts), [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts), [interpreter/shelf/shelf-notes.ts](./interpreter/shelf/shelf-notes.ts)
4. Shape authorization notes using the active display filter, while still resolving authorizable permissions from immutable role identity.
5. Keep callable tools and authorizable tools separate. No fallback path that auto-merges the two sets.

### Testing

- Extend [interpreter/fyi/tool-docs.test.ts](./interpreter/fyi/tool-docs.test.ts) for authorization-note rendering.
- Extend [interpreter/env/executors/call-mcp-config.test.ts](./interpreter/env/executors/call-mcp-config.test.ts) for injected authorization notes at bridge-config time.
- Extend [interpreter/eval/env-mcp-config.test.ts](./interpreter/eval/env-mcp-config.test.ts) for full `config.system` assembly.
- Extend [interpreter/eval/shelf-notes-injection.test.ts](./interpreter/eval/shelf-notes-injection.test.ts) for note ordering with all three blocks present.

### Exit Criteria

- [ ] `<authorization_notes>` exists as its own block.
- [ ] It is rendered from the same tool-doc metadata path as `<tool_notes>`.
- [ ] Its tool set is derived from immutable role-based `authorizable`, not from display overrides or callable tools.
- [ ] `npm test` passes.

## Phase 5 - LSP Semantic Tokens and Regex Highlighting

**Goal**: keep editor support aligned with the new syntax and keywords.

### Tasks

1. Update semantic highlighting for:
   - `authorizable`
   - unquoted `role:*` keys inside plain policy objects
   - any new object-key or keyword classifications introduced by the parser change
2. Update regex-based syntax grammars so the same syntax highlights correctly outside the AST/LSP path.
3. Update [docs/dev/LANGUAGE-SERVER.md](./docs/dev/LANGUAGE-SERVER.md) to document the new obligations and touched files accurately.
4. Keep the token-validator harness aligned with the new parser output and object-key coverage.

### Primary Files

- [services/lsp/ASTSemanticVisitor.ts](./services/lsp/ASTSemanticVisitor.ts)
- [services/lsp/visitors/DirectiveVisitor.ts](./services/lsp/visitors/DirectiveVisitor.ts)
- [services/lsp/visitors/StructureVisitor.ts](./services/lsp/visitors/StructureVisitor.ts)
- [grammar/syntax-generator/build-syntax.js](./grammar/syntax-generator/build-syntax.js)
- [tests/utils/token-validator/TokenCoverageValidator.ts](./tests/utils/token-validator/TokenCoverageValidator.ts)
- [docs/dev/LANGUAGE-SERVER.md](./docs/dev/LANGUAGE-SERVER.md)

### Testing

- [services/lsp/semantic-tokens-unit.test.ts](./services/lsp/semantic-tokens-unit.test.ts)
- [services/lsp/semantic-tokens.test.ts](./services/lsp/semantic-tokens.test.ts)
- [services/lsp/highlighting-rules.test.ts](./services/lsp/highlighting-rules.test.ts)
- [grammar/syntax-generator/build-syntax.test.ts](./grammar/syntax-generator/build-syntax.test.ts)
- `npm run test:tokens`
- `npm run validate:tokens`

### Exit Criteria

- [ ] Semantic highlighting covers `authorizable` and plain-object `role:*` keys correctly.
- [ ] Regex highlighting matches the AST/LSP behavior.
- [ ] `docs/dev/LANGUAGE-SERVER.md` documents the new syntax obligations accurately.
- [ ] `npm run test:tokens` passes.
- [ ] `npm run validate:tokens` passes.
- [ ] `npm test` passes.

## Phase 6 - Docs, Fixtures, and Examples

**Goal**: update the public docs and generated fixtures to reflect the shipped behavior without preserving obsolete planner-worker guidance.

### Tasks

1. Update atoms docs that describe authorization, planner-worker patterns, tool docs, and validation:
   - [docs/src/atoms/config/07b-policy--authorizations.md](./docs/src/atoms/config/07b-policy--authorizations.md)
   - [docs/src/atoms/config/15-tool-docs.md](./docs/src/atoms/config/15-tool-docs.md)
   - [docs/src/atoms/patterns/04-planner.md](./docs/src/atoms/patterns/04-planner.md)
   - [docs/src/atoms/security/_index.md](./docs/src/atoms/security/_index.md)
   - [docs/src/atoms/security/01-security-getting-started.md](./docs/src/atoms/security/01-security-getting-started.md)
   - [docs/src/atoms/core/14-exe--metadata.md](./docs/src/atoms/core/14-exe--metadata.md)
   - [docs/src/atoms/cli/03-validate.md](./docs/src/atoms/cli/03-validate.md)
2. Distinguish clearly between:
   - existing explicit/manual `@policy.build` workflows
   - the new framework-managed persistent-session planner/worker authorization flow
3. Document what this feature does not add:
   - no `privileged` exe label
   - no `src:privileged`
   - display override is not role escalation
4. Add or refresh example blocks so docs-generated fixtures cover the new syntax and note injection behavior.
5. Regenerate docs fixtures and update doc expectations per [docs/dev/TESTS.md](./docs/dev/TESTS.md).

### Testing and Fixture Work

- Add or update `tests/cases/feat/...` fixtures where the behavior is not well covered by docs examples alone.
- Run `npm run build:fixtures`.
- Update generated expectations as needed via the documented `doc:expect` flow.
- Run any doc-expectation tests that fail after fixture regeneration.

### Exit Criteria

- [ ] Docs explain `authorizable`, `<authorization_notes>`, role-vs-display, and framework-managed worker authorization accurately.
- [ ] Obsolete planner examples that imply direct write-tool visibility or mergeable `authorizable` state are removed or rewritten.
- [ ] Docs-generated fixtures are current.
- [ ] `npm run build:fixtures` passes.
- [ ] `npm test` passes.

## Phase 7 - Full Verification and Cleanup

**Goal**: finish with a clean, anti-slop implementation and a fully green repo.

### Tasks

1. Run the full feature verification matrix:
   - targeted grammar tests
   - targeted analyze/validate tests
   - targeted runtime bridge/policy/tool-doc tests
   - LSP and regex test commands
   - docs fixture regeneration
2. Run the broad repo gates:
   - `npm run build`
   - `npm run build:fixtures`
   - `npm run test:tokens`
   - `npm run validate:tokens`
   - `npm test`
3. Do a final anti-slop pass against [docs/dev/ANTI-SLOP.md](./docs/dev/ANTI-SLOP.md):
   - remove defensive checks that only exist because the feature was bolted on
   - remove helper duplication
   - remove compatibility branches that keep old semantics alive
   - make typed policy/AST helpers first-class instead of `Record<string, unknown>` drift

### Exit Criteria

- [ ] The feature is covered by grammar, validator, runtime, LSP, regex, and docs tests.
- [ ] No unresolved docs/fixture drift remains.
- [ ] No backward-compatibility shims or speculative defensive branches remain.
- [ ] `npm run build` passes.
- [ ] `npm run build:fixtures` passes.
- [ ] `npm run test:tokens` passes.
- [ ] `npm run validate:tokens` passes.
- [ ] `npm test` passes.

## Summary of Critical Implementation Rules

- Treat `authorizable` as source-level static metadata, not mergeable runtime authorization state.
- Read authorization identity from exe `role:*` labels only.
- Let display shape visibility only.
- Keep `@policy.build` strict and unchanged internally.
- Reuse existing tool-doc and authorization-compiler machinery instead of cloning it.
- Do not add aliases, dual paths, or defensive slop.
