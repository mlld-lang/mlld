---
updated: 2026-05-05
tags: #arch, #llm, #mcp, #session, #tools
related-docs: docs/dev/INTERPRETER.md, docs/dev/SECURITY.md, docs/dev/DATA.md, docs/dev/PIPELINE.md, docs/user/mcp.md
related-code: interpreter/eval/exec-invocation.ts, interpreter/env/executors/call-mcp-config.ts, interpreter/env/executors/function-mcp-bridge.ts, interpreter/session/runtime.ts, cli/commands/mcp.ts, cli/mcp/*.ts
related-types: core/types { ExecutableVariable, StructuredValue }, core/types/guard { GuardActionNode }, core/types/session { SessionDefinition }
---

# LLM Exe Wiring & MCP

## tldr

Two distinct MCP surfaces share plumbing but serve different roles:

1. **LLM tool bridge** (inbound) — `exe llm` functions automatically get an MCP bridge that exposes mlld executables as tools to the LLM harness. Harness modules (`@mlld/opencode`, `@mlld/claude`) read `@mx.llm` to translate bridge config into CLI flags.
2. **MCP server export** (outbound) — `mlld mcp` exposes exported executables as MCP tools for external consumers over stdio.

Both reuse `evaluateExecInvocation` for dispatch. This doc covers the LLM bridge internals first (the tricky part), then the MCP export server.

## LLM bridge: the `exe llm` contract

An executable with the `llm` label and 2+ parameters (`prompt`, `config`) enters the LLM infrastructure path in `exec-invocation.ts`:

1. `llmTraceFrameId` (UUID) generated for tracing and session scoping.
2. Config arg (`evaluatedArgs[1]`) inspected for `tools`, `_mlld.resume`, other fields.
3. If `config.tools` exists, `createCallMcpConfig` builds a function bridge and writes a temp JSON config.
4. `execEnv.setLlmToolConfig(callConfig)` populates `@mx.llm` for the exe body.
5. After execution, `_mlld` envelope extracted from result to capture session/provider state.

Exes with `llm` label but < 2 params are resume-eligible but skip config injection.

## `@mx.llm` — ambient tool context

Built by `ContextManager.buildLlmContext()` from the `CallMcpConfig` set via `setLlmToolConfig`:

| Field | Source | Purpose |
|---|---|---|
| `config` | `callConfig.mcpConfigPath` | Temp JSON file with `{ mcpServers: { ... } }` |
| `allowed` | `callConfig.unifiedAllowedTools` | CSV of allowed MCP tool names (e.g. `mcp__mlld_tools__greet`) |
| `native` | `callConfig.nativeAllowedTools` | CSV of native harness tools (Claude's `Bash,Read,Write`, etc.) |
| `hasTools` | always `true` when bridge exists | Quick boolean for conditionals |
| `inBox` | from call context | Whether running inside a `box` workspace |
| `sessionId` | `getCurrentLlmSessionId()` | The frame's session UUID |
| `display` | from scoped config | Display mode (`role:planner`, etc.) |
| `resume` | from resume state | `null` or `{ sessionId, provider, continuationOf, attempt }` |

`getLlmToolConfig()` walks the parent environment chain, so child scopes (block bodies, tool callbacks) see the config set by their ancestor `exe llm`.

## Function bridge internals

`createCallMcpConfig` (in `call-mcp-config.ts`) orchestrates bridge setup:

1. Normalizes `config.tools` into `functionTools` (mlld executables) and optional VFS/workspace tools.
2. Calls `createFunctionMcpBridge` → starts a Unix socket MCP server (`FunctionMcpBridgeServer`).
3. Server clones each executable into a `toolEnv` (child of `execEnv`), sets its own `llmToolConfig` with the bridge `sessionId`, handles `tools/call` JSON-RPC requests by routing through cloned executables.
4. Returns `CallMcpConfig` with config path, socket path, tool metadata, cleanup function.

Function-backed `tools/call` requests are serialized per bridge instance before routing into mlld. Harnesses may send multiple MCP tool calls in one model step, but mlld tool sessions and attached `var session` state are mutable; queueing keeps one tool call from racing another against the same session. Protocol-only requests such as `initialize` and `tools/list` stay outside that queue.

When the harness closes the client socket, the bridge aborts active and queued `tools/call` requests for that socket. The active tool call runs under an internal cancellation context; nested exec invocations check that context before dispatch, and MCP-imported tool calls terminate their stdio server process if the abort arrives while a request is pending. The cancellation context is not stored in operation metadata, so it does not appear in `@mx`.

The config file contains `{ mcpServers: { mlld_tools: { command, args, env } } }`. Harness modules read this path from `@mx.llm.config` and translate into harness-specific config.

## How harness modules wire in

See `modules/opencode/index.mld` and `modules/claude/index.mld` for working implementations.

Harness modules are `exe llm` functions that:

1. Read `@mx.llm.hasTools`, `@mx.llm.config`, `@mx.llm.allowed` to detect the bridge.
2. Translate MCP server config into harness-specific format (opencode: `OPENCODE_CONFIG_CONTENT` env var; Claude Code: `--mcp-config` flag).
3. Pass tool permissions to restrict the model to only mlld-provided tools.
4. Shell out to the harness CLI with translated config.
5. Return a `_mlld` envelope: `{ value: <output>, _mlld: { sessionId, provider } }`.

The `_mlld` envelope is extracted by `tryExtractLlmResumeEnvelope` after the exe returns, stripping the wrapper and capturing session state for resume support.

## `_mlld` envelope propagation

When an inner `exe llm` call (e.g. `@opencode`) returns a `_mlld` envelope, exec-invocation:

1. Extracts `resumeState` (sessionId, provider), sets `llmResumeEligible = true`.
2. Updates `operationContext.metadata` with `llmResumeState`.
3. Embeds resume state on the result's `StructuredValue.metadata._mlldResumeState`.

Step 3 enables wrapper exes (which may not have `llm` label) to propagate resume eligibility. The outer call checks `_mlldResumeState` on the StructuredValue as a fallback when no raw `_mlld` envelope exists.

## Session attachment

`var session` declares typed mutable state scoped to an LLM bridge frame.

**Attachment:** `with { session: @planner, seed: { ... } }` on a call → `getNormalizedSessionAttachment(execEnv)` reads scoped config → `materializeSession` creates a `RuntimeSessionInstance` attached to ROOT keyed by `callConfig.sessionId` → `applySeedWrites` initializes slots.

**Seed evaluation:** seed expressions are evaluated while attachment is being built, so they run in a child env that masks the in-progress `session` and `seed` scoped config. Helper exes inside seed must not inherit the same attachment they are materializing, or session attach can recursively re-enter itself.

**Scoped config propagation:** the scoped config must survive through source-scoped envs (imported executables) and frame-scoped envs (LLM trace frames). Both create child environments; the scoped config is explicitly copied to each child.

**Read path:** `resolveVariable` detects session schemas via `internal.isSessionSchema`, calls `resolveAttachedSessionInstance(definition, env)` which looks up by `getCurrentLlmSessionId()` first, then falls back to `findSessionInstanceByDefinition` (scans all frames for matching definition ID). Fallback enables reads from outer scopes and module-level reads after the call returns.

**Write path:** `@session.set(...)` resolves the instance the same way, then `applySlotMutation` → `stageMutation`. If a guard write buffer is active, mutations are staged. Otherwise they commit immediately.

**Disposal:** session instances are kept alive after frame exit so outer scopes and post-call reads work. Each call has its own sessionId key; instances from different calls don't conflict.

## Guard resume

Guards can issue `resume` to continue an LLM conversation for output repair:

```
guard after op:named:worker = when [
  @output.mx.schema.valid == false
    => resume "Fix the JSON" with { tools: @fixTools }
  * => allow
]
```

**Flow:** after-guard evaluates `resume` → `evaluateResumeEnforcement` checks `llmResumeEligible` and `llmResumeState` on operation metadata → `GuardResumeSignal` thrown → retry runner catches, stores `nextAction` → next iteration replaces prompt with hint, injects `continue: true`, clears tools (unless `with { tools: ... }` override).

**Eligibility:** set when exe has `llm` label OR result contains `_mlld` envelope.

**Resume with tools:** `with { tools: @expr }` provides an explicit tool set for the repair pass. Bridge mints fresh handles; old handles from prior turn are dead. Auto-provisioned `@shelve` stays disabled.

## MCP server export

`mlld mcp` exposes exported executables as MCP tools for external consumers:

```
MCP Client ── JSON-RPC over stdio ── MCPServer ── FunctionRouter ── mlld Interpreter
```

### Principles

- Reuse interpreter primitives: build real `ExecInvocation` nodes and call `evaluateExecInvocation`.
- Preserve live structured values internally, emit LLM-boundary display projection for record-coerced tool results.
- Accept back emitted handle, preview, or bare-literal form for security-relevant args and canonicalize before dispatch.
- Keep stdout clean: JSON-RPC to stdout, diagnostics to stderr.
- Fail fast on conflicts: detect duplicate tool names before starting.

### Command entrypoint

- `cli/commands/mcp.ts` parses paths, flags, and optional config modules.
- Default path resolution picks `llm/mcp/` when no argument is provided and the directory exists.
- `--env KEY=VAL,…` sets prefixed environment variables before module interpretation; `--tools` apply after config filtering.
- Duplicate tools across loaded modules halt with a descriptive stderr message.

### Module loading

- `resolveModulePaths()` expands files, directories, or globs into absolute module paths.
- Each module runs through `interpret(..., { captureEnvironment })` for `Environment` and export manifest.
- `/export` directives drive the primary tool list; if absent, falls back to all non-builtin executables.
- Captured module environments attach to each executable to keep `/import` state available during invocation.

### Schema generation

- `SchemaGenerator.generateToolSchema` converts mlld names to snake_case, produces conservative JSON Schema (all-string params, all required).
- Tests: `cli/mcp/SchemaGenerator.test.ts`.

### Tool execution

- `MCPServer` manages JSON-RPC lifecycle (`initialize`, `tools/list`, `tools/call`), enforces initialization.
- `FunctionRouter` converts tool calls into synthetic AST nodes, feeds to `evaluateExecInvocation`, serializes through record display-projection renderer.
- Record-coerced results cross the boundary as safe projection payloads (masked previews + handle wrappers).
- Live `StructuredValue` stays intact internally; projection is an MCP boundary renderer.
- `display: "strict"` forces handle-only projection at the boundary.
- Security-relevant args: runtime canonicalizes emitted handles/previews/bare literals back to live values before dispatch. Preview canonicalization is session-local; ambiguous aliases fail closed.
- Errors become `isError` responses with text content; protocol errors use MCP error codes.

### Configuration modules

- `--config module.mld.md` exports `@config = { tools?, env? }`.
- `config.tools` filters the exported map unless `--tools` is provided.
- `config.env` applies after CLI overrides; both layers ignore keys without `MLLD_` prefix.

### Environment overrides

- `--env KEY=VAL,KEY2=VAL2` applies before config/modules are evaluated. Keys must start with `MLLD_`.
- Config module sees these via `@input`; additional env from `@config.env` layers on top.

## Wrapper exe pattern

A common pattern wraps an `exe llm` harness call inside a non-`llm` exe to add guards, session, or routing:

```
exe @plannerCall(prompt, config, agent) =
  @opencode(@prompt, @config) with { session: @planner, seed: { ... } }
```

This creates multiple scope boundaries. Key behaviors:

- **Tool bridge:** set up by the inner `exe llm` call, not the wrapper. The wrapper's `execEnv` has no `llmToolConfig`. The inner call's `@mx.llm` is populated normally.
- **Resume eligibility:** the wrapper has no `llm` label, so resume state propagates via `_mlldResumeState` on the StructuredValue result (see envelope propagation above).
- **Session:** attached inside the inner call's scope. Scoped config must propagate through source-scoped envs. Session instances survive frame exit for outer-scope reads.
- **Tool collection identity:** imported `var tools` collections lose their `capturedModuleEnv` and authorization metadata (Symbol property `mlld.toolCollectionMetadata`) when nested in a config object and forwarded through the wrapper parameter. The bridge resolver falls back to `looksLikeToolCollection` + `normalizeToolCollection`, which re-resolves executables by name — failing across module isolation boundaries. Local tool collections survive because their executables are in the same module scope. See m-9993.
- **Session roundtrip identity loss:** when the agent config (containing `toolsCollection`) is seeded into a planner session, the session write→read cycle strips Symbol and WeakMap identity from all nested objects. The collection object arrives at the execute worker structurally intact but without the tool collection Symbol. Dispatch recovers via `recoverToolCollectionFromStructure` (structural shape detection). Degraded Variable objects inside entries (`{type: 'executable', name: '...'}`) are recovered by `normalizeCollectionExecutableReferenceName`. The `_mlld.resume.sessionId` key injected by the session framework must be filtered during collection iteration. See m-5178.

## Gotchas

- **Imported tools through wrappers:** imported `var tools` collections nested in config objects lose tool collection identity when forwarded through exe parameters. `@mx.llm.hasTools` may be true but `@mx.llm.allowed` is empty. Workaround: re-attach the lexical tool collection reference at the actual `exe llm` call site rather than forwarding `@config.tools`. Core fix tracked in m-9993.
- **Session-seeded agent loses tool collection identity:** when `agent: @agent` is seeded into a planner session, the session write→read cycle creates new plain objects that drop Symbol-keyed and non-enumerable properties from the `toolsCollection`. Dispatch recovers structurally (m-5178), but `getToolCollectionMetadata` returns `undefined` on the recovered object. The `_mlld` resume key injected by session framework appears as a sibling of tool entries and must be filtered by code that iterates `Object.entries` on the collection.
- Session not attaching for imported modules: check scoped config propagation through source-scoped envs (child env from `setModuleIsolated`). Most common "Session not attached" cause.
- `_mlld` envelope consumed by inner call: inner `exe llm` extracts envelope at its level. Outer wrapper sees stripped value. Resume eligibility propagates via `_mlldResumeState` on StructuredValue metadata.
- Guard resume denied: `evaluateResumeEnforcement` requires `llmResumeEligible` and `llmResumeState` on operation metadata. Both set when exe has `llm` label or result has `_mlld` envelope.
- Tools not visible in harness: verify `@mx.llm.hasTools`, `@mx.llm.config`, `@mx.llm.allowed` from inside the `exe llm` block body. If empty, config arg may not have `tools` or the `hasLlmLabel && llmParamNames >= 2` gate wasn't entered.
- `MLLD_` prefix required for env overrides — missing prefix means silently skipped.
- StructuredValue results must flow through MCP serializer; bypassing display-projection leaks raw record data.
- Config modules execute with same environment as tools — runtime failures abort startup.

## Debugging

- `MLLD_TRACE=session` — session attachment/disposal events.
- `MLLD_TRACE=guard` — guard evaluation decisions.
- `MLLD_TRACE=all` — everything including tool bridge setup.
- `MLLD_TRACE=verbose` with `MLLD_TRACE_FILE=...` — includes `mcp.request`, long-running `mcp.progress`, and `mcp.response` events for the `exe llm` function bridge. Use these to time opencode→mlld MCP calls; `mcp.response` includes `durationMs`, `responseBytes`, `ok`, `isError`, `error`, and `clientClosed`.
- Hangs in ordinary-looking LLM calls: build the smallest zero-LLM `exe llm` repro, then run with `--trace verbose`; add `--trace-memory` only long enough to find the repeated phase. Repeated `llm.exec.session_attach` points at session/seed scoped config inheritance before JSON/stringify walkers.
- `DEBUG_MCP=1` — MCP server diagnostics on stderr.
- `MLLD_DEBUG=true` — interpreter logging for argument binding and execution flow.
- Verify bridge wiring from inside `exe llm` block: `show @mx.llm.hasTools` / `show @mx.llm.config`.
- Unit coverage: `cli/mcp/*.test.ts`, `cli/commands/mcp.test.ts`; run with `npx vitest run cli/mcp --runInBand`.
- MCP test servers: `tests/support/mcp/` (not `tests/fixtures/`).
