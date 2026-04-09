# Runtime Tracing

Runtime tracing is organized around category-specific emit sites and a shared trace manager.

## Where To Emit

- `interpreter/env/Environment.ts`
  Use for environment-owned effects: handle issue/resolve, handle release at bridge teardown, shelf read/write/clear, and generic trace delegation.
- `interpreter/shelf/runtime.ts`
  Use for record validation/coercion and shelf operations that are higher-level than the raw environment slot mutation, such as `shelf.remove`.
- `interpreter/hooks/guard-runtime-evaluator.ts`
  Use for per-guard before-phase decisions and crashes.
- `interpreter/hooks/guard-post-runtime-evaluator.ts`
  Use for per-guard after-phase decisions and crashes.
- `interpreter/hooks/guard-pre-hook.ts`
  Use for aggregate before-phase decision summaries across all evaluated guards.
- `interpreter/hooks/guard-post-orchestrator.ts`
  Use for aggregate after-phase decision summaries across all evaluated guards.
- `interpreter/eval/exec-invocation.ts`
  Use for auth checks and LLM/tool-call lifecycle events that belong to exec invocation flow.
- `interpreter/eval/records/display-projection.ts`
  Use for display projection choices such as bare/masked/handle/omitted.
- `interpreter/env/builtins/policy.ts`
  Use for policy builder and validator compilation events.

## How To Emit

- Build events with helpers from `interpreter/tracing/events.ts`.
- Emit through `env.emitRuntimeTraceEvent(...)`, not by assembling raw envelopes inline.
- Let `Environment` supply execution scope. Only pass `scope` overrides when the event needs extra scope fields.
- If the event depends on shelf write/read coherence, use the shared shelf tracker through `Environment` and `RuntimeTraceManager` rather than maintaining local maps.
- Canonical handle selector is `handle`; `handles` is accepted as an alias at the CLI and in `with { trace }`.

## What Not To Do

- Do not add new root-level trace state to `Environment`.
- Do not hardcode event names in multiple files when a category helper already exists.
- Do not write directly to stderr or JSONL sinks from effect sites; the trace manager owns sinks and filtering.
