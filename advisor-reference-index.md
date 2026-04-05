# Advisor Reference Index

Annotated reading list for the mlld security model advisor role. Organized for progressive exploration — read the essentials first, dig into topics when they come up.

## Essential Reads (before doing anything)

### 1. `plugins/mlld/skills/security/SKILL.md`
The most complete, up-to-date security reference. Covers records, display, handles, policy, guards, shelf, phase-shaped tools, the planner-worker pattern, automatic tool annotations, and the GitHub triage example. Includes a full `mlld howto` reference list. **This is the single best document for understanding the current security model.**

### 2. `../benchmarks/labels-policies-guards.md`
How the security model is explained to benchmark agents and external readers. Covers labels, policies, guards, phase-shaped tool design, records/facts/handles, display projections, bucketed intent, boundary canonicalization, shelf slots, authorization builder, and key points. More tutorial-style than the skill. **Read this to understand how the model is communicated.**

### 3. `spec-data-layer-v3.md`
The overarching data layer spec with implementation status table (41 shipped items). Browse the status table to know what exists. The spec sections cover records, exes, stores (future), facts, handles, display projections, boundary canonicalization, box integration, shelf, and design principles. **This is the authoritative "what's shipped" list.**

### 4. `advisor-briefing.md`
The companion to this document. Covers role context, the mental model, design principles, key decisions, evolution story, lessons learned, and working with Adam. **Read this for orientation and institutional knowledge.**

## By Topic

### Records and data classification
- `docs/src/atoms/core/31-records--basics.md` — the record DSL reference. Facts, data (trusted/untrusted), display, when, validate, root adapters, array fields, handle field type, object field type.
- `spec-trusted-data-fields.md` — trusted data field design (`data: { trusted, untrusted }`).
- `docs/src/atoms/effects/07c-labels--facts.md` — fact labels, pattern matching, discovery.
- `docs/src/atoms/effects/07b-labels--attestations.md` — `known`/`known:*` attestations alongside facts.

### Display projections
- `feat-proof-preserving-return-projections.md` — **the current design**. Supersedes `spec-display-projections.md`. Covers ref/handle/masked/bare/omitted modes, named display modes, data field governance, handle field type, cleaner handle shape, worker return pattern.
- `spec-display-projections.md` — the earlier design. Still has useful background but superseded by the above.

### Handles and proof
- `docs/src/atoms/security/08-facts-and-handles.md` — the big picture: records, facts, handles, display, positive checks, the four layers. The primary user-facing security narrative.
- `spec-fyi-known.md` — `@fyi.known()` as the unified handle discovery surface. Also contains the cleanup plan (narrowing canonicalization to builder auto-upgrade, removing session-local matching, display strict whitelist, taintFacts cleanup).
- `docs/src/atoms/effects/18b-fyi--known.md` — the `@fyi.known()` atom reference.

### Policy and authorization
- `docs/src/atoms/config/07b-policy--authorizations.md` — authorization syntax, deny list, policy builder, bucketed intent, guard retry, control-arg enforcement, update args, exact payload args, dynamic dispatch from collections.
- `spec-authorizations.md` — the full authorization builder spec. Bucketed intent shape, `known` requires uninfluenced source, `resolved` requires handles, builder auto-upgrade, implementation status.
- `docs/src/atoms/config/04-policy--basics.md` — policy objects, built-in rules, locked policies.
- `docs/src/atoms/config/06-policy--operations.md` — operation classification.
- `spec-taint-scoping-control-args.md` — taint checks scoped to control args.
- `spec-update-args-and-payload-validation.md` — `updateArgs` and `exactPayloadArgs`.

### Guards
- `docs/src/atoms/effects/13-guards--basics.md` — guard syntax, timing, four actions (allow/deny/retry/resume), precedence.
- `docs/src/atoms/effects/15-guards--privileged.md` — privileged guards, strategic overrides.
- `spec-guard-resume.md` — the `resume` guard action spec. Continues LLM conversation without re-executing tools.

### Shelf slots
- `docs/src/atoms/security/08c-shelf-slots.md` — typed state accumulation, grounding, cross-slot constraints, access control, dynamic aliasing, trust model.
- `spec-shelf-slots.md` — the full shelf slots design spec.

### Tool documentation and annotations
- `spec-runtime-generated-llm-tool-docs.md` — automatic `<tool_notes>` injection, `@toolDocs()`, MCP vs non-MCP context.
- `spec-tool-table.md` — compact table format for tool annotations.

### Security patterns
- `docs/src/atoms/patterns/04-planner.md` — defended agents / planner-worker pattern. Phase-shaped tools, bucketed intent, collection-key dispatch, named display modes, worker returns with handle type.
- `docs/src/atoms/patterns/05-schema-validation.md` — records + guards for output validation. resume vs retry, validation modes, worker validation pattern.
- `docs/src/atoms/security/01-security-getting-started.md` — progressive security levels (0-4).
- `docs/src/atoms/security/08b-url-exfiltration.md` — `no-novel-urls`, `exfil:fetch`, domain allowlists.

### Trust and taint
- `docs/src/atoms/effects/07-labels--trust.md` — trusted/untrusted, trust refinement on facts and `data.trusted`, taint scoping to control args.
- `docs/src/atoms/effects/05-labels--basics.md` — label categories and propagation.
- `docs/src/atoms/effects/06-labels--sensitivity.md` — secret, sensitive, pii.
- `spec-record-trust-refinement.md` — trust refinement design.

### MCP security
- `docs/src/atoms/security/05-mcp-security--basics.md` — MCP output taint.
- `docs/src/atoms/security/06-mcp-security--policy.md` — label flow rules for MCP data.
- `docs/src/atoms/security/07-mcp-security--guards.md` — guards for MCP tool calls.

### JS/Python interop
- `docs/src/atoms/intro.md` — JS/Python data boundary section. Auto-unwrap, JSON.stringify proof erasure, handle passthrough, `.keep` for metadata access.
- `docs/dev/DATA.md` — StructuredValue model, auto-unwrap behavior, universal value model.

## Specs — Current vs Superseded

### Current (reference as authoritative)
- `spec-authorizations.md` — authorization builder with bucketed intent
- `spec-fyi-known.md` — `@fyi.known()` + canonicalization cleanup plan
- `spec-guard-resume.md` — resume guard action
- `spec-shelf-slots.md` — shelf slots
- `spec-trusted-data-fields.md` — `data: { trusted, untrusted }`
- `spec-update-args-and-payload-validation.md` — `updateArgs` and `exactPayloadArgs`
- `spec-tool-table.md` — compact tool annotation tables
- `spec-runtime-generated-llm-tool-docs.md` — automatic tool doc injection
- `spec-taint-scoping-control-args.md` — taint scoped to control args
- `spec-record-trust-refinement.md` — trust refinement
- `spec-url-exfiltration.md` — URL exfiltration defense
- `spec-positive-check-controlargs.md` — positive checks trust explicit controlArgs
- `spec-strip-data-args-from-auth.md` — data arg stripping
- `feat-proof-preserving-return-projections.md` — handle-first cross-phase identity (supersedes display projections spec)

### Superseded (historical, don't reference as current)
- `spec-display-projections.md` — superseded by `feat-proof-preserving-return-projections.md`
- `plan-boundary-input-canonicalization.md` — superseded by Postel's Goldilocks in `spec-fyi-known.md`
- `cleanup-simplify.md` — merged into `spec-fyi-known.md`
- `plan-spec-data-layer-phase-1.md` — the original implementation plan, fully shipped
- `plan-display-projections.md` — implementation plan for display projections, shipped
- `plan-runtime-repair-safe-yes.md` — phases 1-2 shipped, later phases deferred/superseded

### Future (specced, not yet implemented)
- `feat-cf-dependency-tracking--re-camel.md` — control-flow dependency tracking
- `todo-long-running-agents-concept.md` — conversational agent sessions
- `spec-runtime-effect-tracing.md` — structured runtime trace events
- `spec-deterministic-replay.md` — capture/replay for deterministic debugging
- `req-derived-proof-bearing-values-from-trusted-sources.md` — `@derive()` for derived proof
- `feat-write-payload-contracts-and-update-semantics.md` — broader payload contracts (mostly addressed by `updateArgs`/`exactPayloadArgs`)

## Code Landmarks

### Records and coercion
- `core/types/record.ts` — record type definitions
- `grammar/directives/record.peggy` — record grammar
- `interpreter/eval/record.ts` — record evaluation and registration
- `interpreter/eval/records/coerce-record.ts` — record coercion (parse, validate, label, factsource)
- `interpreter/eval/records/display-projection.ts` — display projection renderer

### Handles
- `interpreter/env/ValueHandleRegistry.ts` — handle storage and resolution
- `interpreter/utils/handle-resolution.ts` — recursive handle resolution
- `core/types/handle.ts` — handle types and `isHandleWrapper`

### Policy and authorization
- `interpreter/policy/authorization-compiler.ts` — shared authorization compiler
- `interpreter/eval/exec/policy-fragment.ts` — `with { policy }` compilation
- `interpreter/env/builtins/policy.ts` — `@policy.build` / `@policy.validate` builtins
- `core/policy/fact-requirements.ts` — fact requirement resolver
- `core/policy/fact-labels.ts` — fact label parsing and matching
- `core/policy/guards.ts` — built-in positive checks
- `core/policy/label-flow.ts` — negative label-flow checks
- `core/policy/authorizations.ts` — authorization normalization and merge

### Guards
- `interpreter/hooks/guard-post-orchestrator.ts` — after-guard orchestration (resume/retry/deny)
- `interpreter/hooks/guard-retry-runner.ts` — retry and resume execution
- `interpreter/hooks/guard-runtime-evaluator.ts` — guard condition evaluation

### Shelf
- `interpreter/shelf/runtime.ts` — shelf slot runtime operations

### Tool docs and bridge
- `interpreter/fyi/tool-docs.ts` — tool doc renderer (`<tool_notes>`, `@toolDocs()`)
- `interpreter/fyi/facts-runtime.ts` — `@fyi.known()` implementation
- `interpreter/eval/exec-invocation.ts` — LLM bridge setup (~line 2146), `<tool_notes>` injection, handle resolution at dispatch, taint scoping, resume state capture
- `interpreter/env/executors/function-mcp-bridge.ts` — MCP tool bridge
- `interpreter/env/executors/call-mcp-config.ts` — bridge config assembly

### Security runtime
- `interpreter/security/runtime-repair.ts` — shared repair spine (narrowed to handle resolution + builder auto-upgrade)
- `interpreter/security/proof-claims.ts` — proof claim collection and matching
- `interpreter/security/canonical-value.ts` — canonical value utilities

### JS interop
- `interpreter/eval/data-values/CollectionEvaluator.ts` — proof preservation during object construction

## The Benchmark

### Architecture docs
- `../benchmarks/capability-migration-priority-plan.md` — migration plan and `@mlld/agentflow` module direction
- `../benchmarks/llm-first-capability-policygen-plan.md` — LLM-first design learnings
- `../benchmarks/spec-waterfall-policygen-refactor.md` — waterfall refactor principles

### Agent code
- `../benchmarks/llm/lib/agentflow/` — the capability agent library (index, state, workers, logging, slot records)
- `../benchmarks/llm/agents/waterfall/` — per-suite entrypoints (workspace, banking, slack, travel)
- `../benchmarks/llm/workers/` — phase workers (resolve_target, extract_target, execute_capability, compose_target)
- `../benchmarks/llm/prompts/` — prompt templates for each phase
- `../benchmarks/llm/tools/` — per-suite tool wrappers with records and display projections

### Comparison
- `../benchmarks/camel-security.md` — CaMeL architecture analysis and comparison with mlld
