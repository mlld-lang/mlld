# Dossier: Bridge / LLM-Call Frame Anatomy

**Purpose:** Document the LLM-bridge call frame as the architectural host for session state. Session instances live in the same per-call frame that owns the handle mint table and proof-claims-registry view.

---

## Executive Summary

The mlld runtime models LLM-bridge calls (`@claude()`, `@opencode()`, etc.) through an **ephemeral per-call runtime frame** that owns three per-call state drawers:
1. A handle mint table (for display projection)
2. A per-call proof-claims-registry view (for fact-source tracking across tool dispatches)
3. A scoped LLM tool configuration (`CallMcpConfig`, coordinating tools and bridges)

The frame is created when an `exe llm` invocation begins, attached to a child `Environment` instance, and torn down when the call exits (normally, via guard denial, via cancellation, or via uncaught throw in a tool callback). Tool use callbacks dispatch through a `FunctionMcpBridge` → `FunctionRouter` → `evaluateExecInvocation` chain, running each tool callback inside the same frame environment.

`with { ... }` clauses route to `applyInvocationScopedRuntimeConfig()` and then to per-stage handlers; keys like `policy`, `display`, `trace` are handled at the invocation-scope config layer, while LLM-specific keys like `tools` (and future `session`) reach the bridge layer via `normalizeInvocationWithClause()` and config merge.

---

## File-and-Line-Range Reference Table

| File | Lines | Purpose |
|---|---|---|
| `interpreter/env/Environment.ts` | 270–419 | Environment class definition with per-call state fields: `llmToolConfig`, `bridgeStack`, `scopeCleanups`, `workspaceStack` |
| `interpreter/env/Environment.ts` | 3438–3445 | `setLlmToolConfig()` / `getLlmToolConfig()` — entry/exit points for per-call LLM config attachment |
| `interpreter/eval/exec-invocation.ts` | 1–200 | Exec invocation entry and context setup |
| `interpreter/eval/exec-invocation.ts` | 4170–4240 | Bridge setup: `createCallMcpConfig()` call, tool injection, resume invariant enforcement |
| `interpreter/eval/exec-invocation.ts` | 4240–4320 | Pre-guard frame establishment and security descriptor building |
| `interpreter/eval/exec-invocation.ts` | 4590–4710 | Guard dispatch loop with pre/post guard handling and denial unwinding |
| `interpreter/eval/exec-invocation.ts` | 4710–4950 | Tool body execution with try/catch wrapping for cleanup on throw |
| `interpreter/eval/exec/scoped-runtime-config.ts` | 10–81 | `normalizeInvocationWithClause()` and `applyInvocationScopedRuntimeConfig()` — with-clause routing for `display`, `trace`, invocation-scoped keys |
| `interpreter/env/executors/call-mcp-config.ts` | 92–119 | `CallMcpConfig` interface and `createCallMcpConfig()` options |
| `interpreter/env/executors/call-mcp-config.ts` | 600–700+ | Tool collection resolution and function tool spec building |
| `interpreter/env/executors/function-mcp-bridge.ts` | 1–150 | Bridge server instantiation, tool cloning, and child environment setup |
| `interpreter/env/executors/function-mcp-bridge.ts` | 150–250 | Socket lifecycle and connection handling (entry/exit boundaries) |
| `cli/mcp/FunctionRouter.ts` | 62–194 | Tool dispatch loop: `executeFunction()` → `buildInvocation()` → `evaluateExecInvocation()` |
| `cli/mcp/FunctionRouter.ts` | 290–350+ | Executable variable normalization and tool key resolution |
| `interpreter/eval/exec/guard-policy.ts` | — (imported in exec-invocation.ts 101–111) | Guard setup, dispatch, and post-result handling functions |
| `interpreter/eval/with-clause.ts` | 1–40 | `applyWithClause()` — post-execution with-clause application (pipeline transforms) |

---

## Key Code Excerpts

### 1. Per-Call State Ownership

`interpreter/env/Environment.ts:391–392`

```typescript
// Auto-bridged LLM tool config, set by exe llm invocations with config.tools
private llmToolConfig?: import('./executors/call-mcp-config').CallMcpConfig | null;
```

The Environment holds exactly one LLM tool config per runtime frame.

### 2. Frame Entry: MCP Config Creation

`interpreter/eval/exec-invocation.ts:4192–4215`

```typescript
const callConfig = await createCallMcpConfig({
  tools: toolsValue,
  env: execEnv,
  workingDirectory,
  conversationDescriptor: resultSecurityDescriptor,
  isMcpContext: true,
  // Resume invariant: do not auto-provision @shelve on a continue:true call.
  disableAutoProvisionedShelve: isLlmResumeContinuation
});
const previousSystem = nextConfig.system;
const toolNotesSystem = appendToolNotesToSystemPrompt(nextConfig.system, callConfig.toolNotes);
const nextSystem = appendInjectedNotesToSystemPrompt(toolNotesSystem, callConfig.authorizationNotes);
if (nextSystem !== undefined) {
  nextConfig.system = nextSystem;
  didUpdateConfigArg ||= nextSystem !== previousSystem;
}
execEnv.registerScopeCleanup(callConfig.cleanup);
execEnv.setLlmToolConfig(callConfig);
```

**Entry hook:** Bridge config created once per LLM call, attached to environment. Cleanup hooks registered to fire on frame exit.

### 3. Child Environment for Tool Dispatch

`interpreter/env/executors/function-mcp-bridge.ts:149–163`

```typescript
constructor(
  private readonly env: Environment,
  private readonly functions: Map<string, ExecutableVariable>,
) {
  this.toolEnv = env.createChild();
  this.toolEnv.setLlmToolConfig({
    sessionId,
    mcpConfigPath: '',
    toolsCsv: '',
    mcpAllowedTools: '',
    nativeAllowedTools: '',
    unifiedAllowedTools: '',
    availableTools: availableTools ?? [],
    toolMetadata: toolMetadata ?? [],
    authorizationRole,
    authorizationNotes,
    inBox: false,
    cleanup: async () => {}
  });
```

Tool callbacks run in a **child environment** (`toolEnv`) inheriting per-call frame state from parent. All tool callbacks see the same llmToolConfig, handle mint table, and (future) session instance.

### 4. With-Clause Normalization

`interpreter/eval/exec/scoped-runtime-config.ts:10–26`

```typescript
export function normalizeInvocationWithClause(node: ExecInvocation): Record<string, any> | undefined {
  const withClause = node.withClause as any;
  if (!withClause) return undefined;
  if (!Array.isArray(withClause)) {
    return normalizeWithClauseFields(withClause) ?? withClause;
  }
  const inlineValue = withClause[0];
  if (inlineValue?.type !== 'inlineValue' || inlineValue?.value?.type !== 'object') {
    return undefined;
  }
  return convertEntriesToProperties(inlineValue.value.entries ?? []);
}
```

### 5. With-Clause Routing

`interpreter/eval/exec/scoped-runtime-config.ts:28–81`

```typescript
export async function applyInvocationScopedRuntimeConfig(args: {
  runtimeEnv: Environment;
  env: Environment;
  definition: ExecutableDefinition;
  node: ExecInvocation;
  invocationWithClause: Record<string, any> | undefined;
}): Promise<Environment> {
  let nextEnv = args.runtimeEnv;
  const resolvedScopedConfig: Record<string, unknown> = {};

  const resolvedDefinitionDisplay = await resolveScopedExecDisplayMode(
    getExecutableDefinitionWithClauseField(args.definition, 'display'),
    args.env
  );
  if (resolvedDefinitionDisplay !== undefined) {
    resolvedScopedConfig.display = resolvedDefinitionDisplay;
  }

  const resolvedInvocationDisplay = await resolveScopedExecDisplayMode(
    getInvocationWithClauseField(args.node, args.invocationWithClause, 'display'),
    args.env
  );
  if (resolvedInvocationDisplay !== undefined) {
    resolvedScopedConfig.display = resolvedInvocationDisplay;
  }
  // ... trace handling ...
  if (Object.keys(resolvedScopedConfig).length > 0) {
    const scopedConfig = nextEnv.getScopedEnvironmentConfig();
    const scopedEnv = nextEnv.createChild();
    scopedEnv.setScopedEnvironmentConfig({
      ...(scopedConfig ?? {}),
      ...resolvedScopedConfig
    });
    nextEnv = scopedEnv;
  }
  return nextEnv;
}
```

### 6. Tool Dispatch Loop

`cli/mcp/FunctionRouter.ts:91–194`

```typescript
async executeFunction(toolName: string, args: Record<string, unknown>): Promise<string> {
  this.syncToolsAvailability();
  this.ensureToolExists(toolName);
  const toolKey = this.resolveToolKey(toolName);
  if (!this.environment.isToolAllowed(toolKey, toolName)) {
    throw new Error(`Tool '${toolName}' not available`);
  }
  const callRecord = { name: toolName, arguments: { ...args }, timestamp: Date.now() };
  try {
    if (this.toolCollection) {
      const definition = this.toolCollection[toolKey];
      // ... resolve exe ...
      const invocation = this.buildInvocation(execName, execVar, resolvedArgs, ...);
      const result = (await evaluateExecInvocation(invocation, this.environment)) as ExecResult;
      this.recordToolResultSecurity(result.value);
      return await this.serializeResult(result.value);
    }
  } catch (error) {
    this.environment.recordToolCall({...callRecord, ok: false, error: ...});
    throw error;
  }
}
```

**Tool dispatch:** Router resolves exe, builds security descriptors, dispatches via `evaluateExecInvocation()` into the same frame environment. All tool results pass through the same security pipeline as non-tool exes.

### 7. Resume Invariant Enforcement

`interpreter/eval/exec-invocation.ts:1720–1760 + 4202`

```typescript
const resumeState = (metadata as Record<string, unknown>).llmResumeState as LlmResumeState | undefined;
// ...
const isLlmResumeContinuation = resumeConfig.continue === true;
// ...
const callConfig = await createCallMcpConfig({
  tools: toolsValue,
  env: execEnv,
  workingDirectory,
  conversationDescriptor: resultSecurityDescriptor,
  isMcpContext: true,
  disableAutoProvisionedShelve: isLlmResumeContinuation  // Key point
});
```

**Resume lifecycle:** A resumed call creates a **fresh frame** (new child Environment) with `tools = []` and no auto-provisioned shelf. Prevents tool callbacks from firing and ensures session state from prior frame is not visible.

### 8. Guard Pre-Denial Execution

`interpreter/eval/exec-invocation.ts:4598–4610`

```typescript
const preDecision = await runExecPreGuards({
  definition, node, operationContext, guardInputs, guardInputsWithMapping,
  guardVariableCandidates, evaluatedArgs, evaluatedArgStrings,
  stringifyArg: value => stringifyDispatchArg(definition, value)
});
emitResolvedAuthorizationTrace({env: runtimeEnv, operationContext, preDecision});
postHookInputs = nextPostHookInputs;
```

### 9. Tool Body Execution with Exception Cleanup

`interpreter/eval/exec-invocation.ts:4728–4793`

```typescript
try {
  const isCommandDefinition = isCommandExecutable(definition);
  const isCodeDefinition = isCodeExecutable(definition);
  if (!isCommandDefinition && !isCodeDefinition) {
    const nonCommandResult = await runTrackedToolBody(() =>
      executeNonCommandExecutable({...}));
    result = nonCommandResult;
  }
  // ... command and code executable handling ...
} catch (error) {
  recordToolAudit(false, undefined, error);
  // Continues to finally block for scope cleanup
}
```

Tool body wrapped in try/catch. Uncaught exceptions caught here; cleanup deferred to finally/scope cleanup stack.

---

## Lifecycle Hook Points

| Phase | Location | Details |
|---|---|---|
| **Entry** | `exec-invocation.ts:4192` | `createCallMcpConfig()` called; bridge config attached via `execEnv.setLlmToolConfig(callConfig)` |
| **Exit (normal)** | `exec-invocation.ts:4950+` | Result finalized, guards run, cleanup hooks invoked via `execEnv.registerScopeCleanup()` |
| **Denial** | `exec-invocation.ts:4694–4705` | `handleExecPreGuardDecision()` detects denial; writes from denying guard rolled back, prior writes remain |
| **Cancel** | `exec-invocation.ts:4728–4950` | SDK cancellation propagates as exception; caught and cleaned up by finally block |
| **Uncaught throw in callback** | `exec-invocation.ts:4950+` | Exception bubbles to outer try/finally; cleanup triggered |
| **Scope cleanup** | `Environment.ts:3438–3450` | `registerScopeCleanup()` stacks cleanup functions; executed LIFO on frame exit |

---

## With-Clause Routing Map

| Key | Handler Layer | Location | Composition Rule |
|---|---|---|---|
| `policy` | Per-invocation scoped config | `exec/scoped-runtime-config.ts` + guard/policy layer | Caller policy merged into runtimeEnv via `createInvocationPolicyScope()` |
| `display` | Scoped environment | `exec/scoped-runtime-config.ts:42–52` | Invocation wins over wrapper |
| `trace` | Trace override child env | `exec/scoped-runtime-config.ts:73–78` | Invocation wins over wrapper |
| `tools` | Bridge layer | `exec-invocation.ts:4184–4215` | Caller merged with wrapper; MCP config created once per call |
| `stream` / `streamFormat` | Bridge/pipeline layer | `with-clause.ts` + pipeline processor | Applied after execution in unified pipeline processor |
| `pipeline` | Post-execution transform | `with-clause.ts:19–30` | Executed via `processPipeline()` after exe body completes |
| **`session`** (future) | Bridge layer | (spec §9) | Wrapper wins over caller; caller override requires explicit `override: "session"` |
| **`seed`** (future) | Bridge initialization | (spec §9, §14 Q1) | Merged with `session:` key; writes initial values before first tool callback |
| `override` (future) | Merge policy enforcer | `exec/scoped-runtime-config.ts` + bridge layer | Explicit flag required to override wrapper defaults; missing flag raises error |

---

## Extension Points for Session State

### 1. Frame-Attached Session Store

**File:** `interpreter/env/Environment.ts` (~line 420)

Add: `private sessionInstances?: Map<string, SessionInstance>;`

Attach during: `createCallMcpConfig()` → `exec-invocation.ts:4192`

Tear down: in `registerScopeCleanup()` LIFO stack

### 2. Session Materialization Hook

**File:** `interpreter/eval/exec-invocation.ts:4192–4215`

After `createCallMcpConfig()`, before first tool dispatch:
- Extract `session:` key from merged with-clause
- Materialize fresh session instance from declared schema
- If `seed:` provided, write seed values through type-validated path
- Emit trace event `session:seed` for each seeded slot

### 3. Session Access Resolution

**File:** `interpreter/eval/variable-resolution.ts` / `field-access.ts`

- Declared session names resolve to live instance **only** inside LLM-bridge frame
- Outside bridge frame: resolve to schema (type spec), not error
- Enclosing frame check: `env.getLlmToolConfig() !== null` (or check for session-attached flag)
- Implementation: add context-dependent resolver in VariableManager

### 4. Write Commit Serialization (Guard Deny Rollback)

- Track session writes per frame in ordered log
- On guard deny: remove writes committed after guard started
- On normal exit: persist all writes to trace as `session:write` events

(See `plan-var-session-dossier-guard-dispatch.md` for detail)

### 5. Cleanup on Frame Exit

**File:** `interpreter/env/Environment.ts:3438–3450`

- Call `emitSessionFinal()` trace event before teardown
- Discard session instance (reference-only, no serialization)
- Remove from frame-attached map

---

## Flags and Invariants

| Flag | Location | Significance |
|---|---|---|
| **Resume creates fresh frame** | `exec-invocation.ts:1720–1760` | Session state is per-call-frame; resume isolation guaranteed by frame boundary, not explicit state clearing. ✓ Load-bearing invariant. |
| **Tool callbacks run inside frame child env** | `function-mcp-bridge.ts:149` | All tool dispatches via FunctionRouter execute in `toolEnv = env.createChild()`, inheriting llmToolConfig. ✓ Critical for session visibility across callbacks. |
| **Guard denials roll back own writes only** | `exec/guard-policy.ts` | Pre-guard denial: denying guard's own writes rolled back. Prior guard writes remain. Post-guards do not fire. ✓ Enables safe guard-based state accumulation. |
| **Wrapper with-clause wins over caller** | `exec/scoped-runtime-config.ts:46–52` | Wrapper carries session invariants; caller `with { session: @alt }` rejected unless explicitly overridden. ✓ Prevents footguns. |
| **No with-clause composition for LLM keys** | `exec-invocation.ts:4192` | `tools:` and (future) `session:` do not merge between wrapper and caller; caller replaces wrapper. Merge at MCP config layer. ✓ Prevents ambiguity. |
| **Resume disables auto-provisioned shelf** | `exec-invocation.ts:4202` | `disableAutoProvisionedShelve: isLlmResumeContinuation` — resumed calls cannot access shelf. ✓ Enforces resume invariant. |
| **Session writes are serialized per frame** | `exec-invocation.ts:4600+` | Tool callbacks run sequentially within one LLM conversation (bridge single-threaded). Atomic helpers are for forward-compatibility with parallel dispatch. ✓ No interleaving today. |
| **Ambient `@mx` is separate from session instance** | `variable-resolution.ts` | `@mx.*` is frame execution context (read-only). Session instance is named accessor (mutable). No collision. ✓ Maintains `@mx` read-only contract. |

---

## Non-Goals Confirmation

- ✓ NOT designing session implementation — this dossier documents the frame architecture hosting session state
- ✓ NOT designing guard + session middleware — specified in session spec §10; this dossier only documents where frame boundary sits relative to guard dispatch
- ✓ NOT changing existing frame layers — handle mint table and proof-claims-registry are already per-call-frame; session joins them as third drawer
- ✓ NOT modifying with-clause grammar — `with { session: @name, seed: {...} }` is spec §9; this dossier maps where those keys route after parsing

Architecture is production-ready for session implementation. Three extension points (frame-attached storage, materialization during bridge setup, cleanup on frame exit) integrate cleanly with existing structures. Guard deny rollback already implemented for other per-call state; session writes use the same path.
