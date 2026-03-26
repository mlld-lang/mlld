# Planner Design Questions

Open UX and protocol questions for the planner-worker authorization pattern. The runtime implementation is complete -- these are about the LLM-facing contract, recommended patterns, and docs.

Expect to resolve most of these through dogfooding the updated planner in the benchmarks repo.

## Discovery payload

- `@fyi.facts()` returns `{ handle, label, field, fact }`. Is that rich enough for model selection quality?
- Safe labels use sibling display fields or masked fallbacks (`a***@example.com`). Is masking too lossy for the model to choose correctly? Do we need configurable display strategies?
- Should discovery responses include any additional context (record name, tier, source tool) or is that scope creep?

## Planner output shape

- Single value pinning: `{ "recipient": { "handle": "h_1" } }` -- confirmed working
- Array pinning: `[{ "handle": "h_1" }, { "handle": "h_2" }]` -- should work through the same resolution path, needs confirmation
- `oneOf` constraints: should planners author these directly, or is that too complex for an LLM to produce reliably?
- What's the minimal viable authorization shape a planner needs to produce? Can we make it simpler than the full `authorizations.allow` structure?

## Failure modes

- Planner returns a raw literal instead of a handle: fails closed today. Should the error message hint at handle usage? Should there be a retry path?
- Unknown/stale handle in authorization: fails closed with `MlldSecurityError`. Is the error message clear enough? Should it suggest re-running discovery?
- Planner omits a control arg from authorization: caught by `mlld validate`. Is the runtime error clear when it happens at execution time?

## Authoring model

- Two pinning styles are implemented: live-value pinning (`recipient: @contacts.email`) and handle-based JSON (`recipient: { "handle": "h_1" }`). When should users use which?
- Live-value pinning is simpler when the planner is mlld code. Handle-based is necessary when the planner is an LLM producing JSON. The docs should make this distinction clear.
- Should we recommend one as the default pattern and the other as the advanced case?

## Handle lifecycle

- Handles are execution-scoped and opaque. Not stable IDs, not persistable.
- Should we document explicit handle lifetime semantics (valid until execution ends, not valid across box boundaries, etc.)?
- If a planner runs in one box and the worker in another, do handles transfer? (They should if they share a root environment.)

## Template-embedded discovery for tool-less agents

- Should there be an `@fyi` interpolated variable that can be embedded in a template, so agents without tool-calling can receive fact candidates in their prompt context?
- Use case: simpler LLMs or prompt-only pipelines where the orchestrator pre-populates available facts into the template rather than giving the agent a discovery tool to call
- Shape could be something like `@fyi.facts.sendEmail.recipient` expanding to the candidate list inline
- Tension: this bypasses the agent-calls-tool model and puts the orchestrator in charge of discovery scoping. That might be fine for simpler patterns where the orchestrator already knows what the agent needs.

## Multi-agent patterns

- The benchmarks repo has a planner-worker architecture awaiting these features. What does the full recommended flow look like end to end?
- Should the standard pattern include explicit `@fyi.facts()` calls in the planner prompt, or should the planner discover them through tool descriptions?
- How should the handoff work: planner returns JSON that gets parsed and merged into worker policy? Or planner sets variables that the orchestrator wires into policy?

## Schema and validation

- `mlld validate` catches some authorization issues statically. What's the expected validation coverage for handle-based auth bundles?
- Should there be a runtime diagnostic mode that logs handle resolution during policy activation for debugging?
