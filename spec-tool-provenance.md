# Tool Provenance System: Audit Log, Taint-Level History, and Dynamic MCP

## Context

mlld's security model tracks data labels and taint as values flow through pipelines — but tool call provenance is invisible. `@mx.tools.calls` tracks which tools have been called during the current execution (a global counter), but it can't answer "what tools produced *this specific data*?" Guards that need to verify a value passed through a debiasing tool before being sent as advice have to resort to string-matching on conversation history text, which is injectable by adversaries.

Additionally, MCP tool calls have no audit trail. The existing audit log (`.mlld/sec/audit.jsonl`) tracks label/taint events and file writes, but not tool invocations — making post-hoc debugging of agent behavior impossible without custom logging in every MCP server.

Finally, `import tools from mcp "command"` requires a static string. Parallel agent tasks that each need their own MCP server (different task_id, state, config) have no way to parameterize the server command per-execution.

These three features form one coherent system:
1. **Audit log with UUIDs** — every tool call logged with a unique ID
2. **Tool provenance on SecurityDescriptor** — lightweight chain referencing audit UUIDs, propagating with data
3. **`@mx.tools.history`** — guards access the provenance chain on their inputs
4. **SDK `mcpServers` option** — per-execution MCP server injection
5. **`var tools @t = mcp @command`** — dynamic MCP as a language-level feature

---

## Phase 1: Audit Log — UUIDs and Tool Call Events

### Goal
Add UUIDs to all audit events. Add `event: 'toolCall'` entries for every exe invocation with full args, result summary, labels, taint, and timing.

### Current state

**`core/security/AuditLogger.ts`** (56 lines):
- `AuditEvent` type (lines 5-22): flat object with `event: string` and ~14 optional fields
- `appendAuditEvent(fileSystem, projectRoot, event): Promise<void>` (lines 24-55): builds a record with conditional spread, writes as JSONL to `.mlld/sec/audit.jsonl`
- Returns `Promise<void>` — no ID returned

**Callers** use a consistent pattern (see `interpreter/utils/audit-log.ts:21`, `interpreter/hooks/guard-utils.ts:194`, `interpreter/eval/label-modification.ts:157`, `interpreter/env/executors/CommandExecutorFactory.ts:451`, `interpreter/env/Environment.ts:1372`, `cli/commands/live-stdio-security.ts:192`):
```typescript
await appendAuditEvent(env.getFileSystemService(), env.getProjectRoot(), {
  event: 'write',
  path: targetPath,
  taint,
  writer
});
```

### Changes

**`core/security/AuditLogger.ts`:**
1. Add `id?: string` to `AuditEvent` type (for pre-generated IDs, or auto-generate)
2. Add tool-call-specific fields to `AuditEvent`:
   - `tool?: string` (tool name)
   - `args?: Record<string, unknown>` (full arguments)
   - `resultLength?: number` (result size, not full content)
   - `duration?: number` (ms)
   - `ok?: boolean` (success/failure)
3. Change `appendAuditEvent` return type from `Promise<void>` to `Promise<string>` — returns the UUID
4. Generate UUID via `crypto.randomUUID()` at start of function (already used in `interpreter/checkpoint/CheckpointManager.ts`)
5. Include `id` in every written record

All existing callers currently `await` the result but don't use the return value, so the signature change is backward-compatible. Callers that need the UUID (the new tool call logger) will capture it.

**New helper: `interpreter/utils/audit-log.ts`** — add `logToolCallEvent()`:
```typescript
export async function logToolCallEvent(
  env: Environment,
  options: {
    tool: string;
    args: Record<string, unknown>;
    ok: boolean;
    error?: string;
    resultLength?: number;
    duration?: number;
    labels?: readonly string[];
    taint?: readonly string[];
    sources?: readonly string[];
  }
): Promise<string> {
  return appendAuditEvent(env.getFileSystemService(), env.getProjectRoot(), {
    event: 'toolCall',
    tool: options.tool,
    args: options.args,
    ok: options.ok,
    ...(options.error ? { detail: options.error } : {}),
    ...(options.resultLength !== undefined ? { resultLength: options.resultLength } : {}),
    ...(options.duration !== undefined ? { duration: options.duration } : {}),
    labels: options.labels ? [...options.labels] : undefined,
    taint: options.taint ? [...options.taint] : undefined,
  });
}
```

**`interpreter/eval/exec-invocation.ts`** — add audit logging at the tool call recording site:

The recording happens at lines 2115 (success) and 2118 (error). Currently:
```typescript
recordToolCall(true);   // line 2115
return invocationResult;
```

After the change, the `recordToolCall` closure (lines 1693-1706) will also write to the audit log and store the returned UUID for use when building the result's SecurityDescriptor. We need the UUID before the result descriptor is built, so the audit write must happen within the `recordToolCall` closure.

Key timing: `recordToolCall(true)` is called at line 2115, *after* the tool has executed and the result exists. The result descriptor is already built by this point (lines 1785-1833). So we have two options:
- (a) Write audit log in `recordToolCall`, store UUID on the `toolCallRecordBase` object, then read it back when building the descriptor piece — but the descriptor is built before `recordToolCall` runs
- (b) Write audit log *during* descriptor construction (around line 1805), capture UUID, include it in the descriptor's tools entry

Option (b) is cleaner. Add audit logging at ~line 1805 where `descriptorPieces` are assembled, right after all the descriptor info is available:

```typescript
// After line 1803 (sourceTaintLabel push)
const auditUuid = await logToolCallEvent(runtimeEnv, {
  tool: trackedToolName,
  args: buildToolCallArguments(params, evaluatedArgs),
  ok: true,
  resultLength: typeof result === 'string' ? result.length : undefined,
  duration: /* wrap execution in perf timer */,
  labels: exeLabels,
  taint: descriptorToInputTaint(mergedParamDescriptor),
  sources: mcpSecurityDescriptor?.sources
});
```

Wait — the execution result isn't available at line 1805 (that's pre-execution descriptor setup). The actual execution happens at lines 1846-2113. So the audit log write must happen *after* execution, near line 2115. The descriptor gets *applied* to the result at lines 2005-2013. So:

1. Add `performance.now()` timing around the execution block (lines 1846-2113)
2. After execution succeeds (line 2115), write audit event, capture UUID
3. Store UUID on a local variable
4. Use UUID when building the ToolProvenance entry (Phase 2) before descriptor application at line 2005

Actually, re-reading the flow more carefully:
- Lines 1785-1833: Build `resultSecurityDescriptor` from descriptor pieces (tool def + params + MCP + source taint)
- Lines 1836-2003: Pre-guard handling, execution, post-guard handling
- Line 2005-2013: Apply `resultSecurityDescriptor` to the actual result value
- Line 2115: `recordToolCall(true)`

The right approach: after execution succeeds but before `recordToolCall(true)` at line 2115, write the audit event and capture the UUID. Then in Phase 2, before line 2005 (descriptor application), inject the tool provenance entry into `resultSecurityDescriptor`. Since both happen sequentially in the same block, this works:

```
// existing line 2113: end of execution block
// NEW: capture timing, write audit log, get UUID
const toolAuditId = await logToolCallEvent(runtimeEnv, { ... });
// NEW: inject ToolProvenance into resultSecurityDescriptor (Phase 2)
recordToolCall(true);  // existing line 2115
return invocationResult; // existing line 2116
```

**`cli/mcp/FunctionRouter.ts`** — same pattern at lines 94-98 and 119-123 (success paths) and 126-130 (error path). The FunctionRouter has access to the environment, so it can call `logToolCallEvent` directly.

### Files modified
- `core/security/AuditLogger.ts` — UUID generation, new fields, return type
- `interpreter/utils/audit-log.ts` — new `logToolCallEvent()` helper
- `interpreter/eval/exec-invocation.ts` — audit logging at tool call site
- `cli/mcp/FunctionRouter.ts` — audit logging for MCP server-side calls

---

## Phase 2: ToolProvenance on SecurityDescriptor

### Goal
Add a `tools` field to SecurityDescriptor that accumulates tool call provenance as data flows through the system. Each entry is lightweight (tool name, arg names, audit UUID reference). The array grows monotonically through descriptor merges — like taint, it never shrinks.

### Current state

**`core/types/security.ts`** — SecurityDescriptor (lines 72-78):
```typescript
export interface SecurityDescriptor {
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly capability?: CapabilityKind;
  readonly policyContext?: Readonly<Record<string, unknown>>;
}
```

**`createDescriptor()`** (lines 155-169): takes labels, taint, sources, capability, policyContext — returns frozen object.

**`makeSecurityDescriptor()`** (lines 171-189): factory that deduplicates arrays via `freezeArray()` (which uses `new Set()`). Note: tools should NOT be deduplicated by Set since they're objects, not strings — use a different strategy.

**`mergeDescriptors()`** (lines 239-275): merges labels (→ Set), taint (→ Set), sources (→ Set). All use set-based dedup. Tools need ordered concat with identity-based dedup.

**`normalizeSecurityDescriptor()`** (lines 198-237): normalizes loose inputs into proper SecurityDescriptor. Needs to handle `tools` field.

**`serializeSecurityDescriptor()`** (lines 285-296): creates mutable copy with `Array.from()` for arrays. Add `tools` serialization.

**`deserializeSecurityDescriptor()`** (lines 298-309): calls `makeSecurityDescriptor()` to reconstruct. Pass `tools` through.

**`SerializedSecurityDescriptor`** (lines 92-98): mutable version for serialization. Add `tools` field.

### New type

```typescript
export interface ToolProvenance {
  readonly name: string;
  readonly args?: readonly string[];  // arg names or truncated values
  readonly auditRef?: string;         // UUID linking to audit.jsonl entry
}
```

### Changes to `core/types/security.ts`

1. Add `ToolProvenance` interface (above SecurityDescriptor)

2. Add to `SecurityDescriptor`:
   ```typescript
   readonly tools?: readonly ToolProvenance[];
   ```

3. Add to `SerializedSecurityDescriptor`:
   ```typescript
   tools?: ToolProvenance[];
   ```

4. Update `createDescriptor()` — add `tools` parameter:
   ```typescript
   function createDescriptor(
     labels, taint, sources, capability, policyContext,
     tools?: readonly ToolProvenance[]
   ): SecurityDescriptor {
     return Object.freeze({
       labels, taint, sources, capability, policyContext,
       ...(tools && tools.length > 0 ? { tools } : {})
     });
   }
   ```

5. Update `makeSecurityDescriptor()` — accept `tools?: Iterable<ToolProvenance>`:
   - Freeze the tools array via `Object.freeze(Array.from(tools))` (no Set dedup — these are objects)
   - Pass to `createDescriptor()`

6. Update `mergeDescriptors()` — concat tools arrays with dedup:
   ```typescript
   const toolsList: ToolProvenance[] = [];
   const seenTools = new Set<string>();
   for (const incoming of descriptors) {
     const descriptor = normalizeSecurityDescriptor(incoming);
     if (!descriptor?.tools) continue;
     for (const t of descriptor.tools) {
       // Dedup by auditRef (unique per call) or by name+args hash as fallback
       const key = t.auditRef ?? `${t.name}:${JSON.stringify(t.args)}`;
       if (!seenTools.has(key)) {
         seenTools.add(key);
         toolsList.push(t);
       }
     }
   }
   ```

7. Update `normalizeSecurityDescriptor()` — pass through `tools` field if present on input

8. Update `serializeSecurityDescriptor()` — include `tools: descriptor.tools ? [...descriptor.tools] : undefined`

9. Update `deserializeSecurityDescriptor()` — pass `tools` to `makeSecurityDescriptor()`

### Changes to value carriers

**`interpreter/utils/structured-value.ts`** — `applySecurityDescriptorToStructuredValue()` (lines 428-441):
Currently flattens `labels`, `taint`, `sources`, `policy` from descriptor to `value.mx`. Add:
```typescript
(value.mx as any).tools = normalized.tools ? [...normalized.tools] : [];
```

**`core/types/variable/VariableTypes.ts`** — `VariableContext` interface:
Add: `tools?: readonly ToolProvenance[];`
This allows `variable.mx.tools` to carry provenance, which is read in `buildPerInputCandidates()`.

### Changes to exec-invocation.ts — injecting provenance into results

After the audit log write from Phase 1 captures a UUID, build a ToolProvenance entry and inject it into the result descriptor.

At ~line 2005 (descriptor application), before `setStructuredSecurityDescriptor`:

```typescript
// Build provenance entry from this tool call
if (trackedToolName && toolAuditId) {
  const provenance: ToolProvenance = {
    name: trackedToolName,
    args: params,  // just param names, not values
    auditRef: toolAuditId
  };
  // Merge provenance into resultSecurityDescriptor
  // Input params' descriptors already carry their own tools chains
  // The result descriptor inherits those + adds this tool
  resultSecurityDescriptor = makeSecurityDescriptor({
    ...resultSecurityDescriptor,
    tools: [...(resultSecurityDescriptor?.tools ?? []), provenance]
  });
}
```

This happens naturally: the `mergedParamDescriptor` (built from input args at line 1791) already carries the input values' tool chains via `mergeDescriptors`. When we push the current tool call onto the end, the result carries the full chain: "data came from tool A → tool B → this tool."

### Files modified
- `core/types/security.ts` — ToolProvenance type, SecurityDescriptor.tools, merge/create/serialize/normalize
- `interpreter/utils/structured-value.ts` — flatten tools to mx
- `core/types/variable/VariableTypes.ts` — VariableContext.tools
- `interpreter/eval/exec-invocation.ts` — build and inject ToolProvenance at result descriptor site

---

## Phase 3: Guard Access via @mx.tools.history

### Goal
Guards can access the tool provenance chain on their input data via `@mx.tools.history`. This is the value-level complement to `@mx.tools.calls` (execution-level).

### Current state

**Guard inputs get taint from variable.mx:**
- `buildPerInputCandidates()` in `interpreter/hooks/guard-candidate-selection.ts` (lines 21-55): reads `variable.mx.labels`, `variable.mx.sources`, `variable.mx.taint`
- `PerInputCandidate` interface (lines 12-19): has `labels`, `sources`, `taint`
- `OperationSnapshot` in `interpreter/hooks/guard-operation-keys.ts` (lines 7-13): has `labels`, `sources`, `taint`, `aggregate`, `variables`

**Guard context is built and exposed as @mx:**
- `GuardContextSnapshot` in `interpreter/env/ContextManager.ts` (lines 49-63): has `labels`, `sources`, `taint`
- `buildAmbientContext()` in `ContextManager.ts` (lines 373-406): builds `@mx` object, includes `taint` from guardContext (line 385) and `tools: this.getToolsSnapshot()` (line 401)
- `getToolsSnapshot()` (lines 299-306): returns `{ calls, allowed, denied, results }`

**The @mx.tools object** currently comes from ContextManager (execution-level tracking). The `history` field would come from the guard input's descriptor (value-level tracking).

### Changes

**`interpreter/hooks/guard-candidate-selection.ts`** — `PerInputCandidate`:
Add: `toolProvenance?: readonly ToolProvenance[];`
In `buildPerInputCandidates()` (line 33), add:
```typescript
const toolProvenance = Array.isArray(variable.mx?.tools) ? variable.mx.tools : [];
```
Include in the result object at line 50.

**`interpreter/hooks/guard-operation-keys.ts`** — `OperationSnapshot`:
Add: `toolProvenance?: readonly ToolProvenance[];`
In `buildOperationSnapshot()`, extract from aggregate or merge from all input variables.

**`interpreter/hooks/guard-runtime-evaluator.ts`** — populate `GuardContextSnapshot`:
At lines 149-164, where contextLabels/contextSources/contextTaint are assigned:
```typescript
let contextToolProvenance: readonly ToolProvenance[];
// perInput path:
contextToolProvenance = options.perInput.toolProvenance ?? [];
// perOperation path:
contextToolProvenance = options.operationSnapshot.toolProvenance ?? [];
```
Include in GuardContextSnapshot creation at line 200-216:
```typescript
toolProvenance: contextToolProvenance,
```

**`interpreter/env/ContextManager.ts`** — `GuardContextSnapshot`:
Add: `toolProvenance?: readonly ToolProvenance[];`

**`interpreter/env/ContextManager.ts`** — `ToolsContextSnapshot`:
Add: `history: ReadonlyArray<ToolProvenance>;`

**`interpreter/env/ContextManager.ts`** — `buildAmbientContext()`:
At line 401, modify the tools object:
```typescript
tools: {
  ...this.getToolsSnapshot(),
  history: guardContext?.toolProvenance
    ? Array.from(guardContext.toolProvenance)
    : []
},
```

This means `@mx.tools.history` is the provenance chain from the guard inputs' descriptors, while `@mx.tools.calls` remains the execution-level call list. Both coexist on `@mx.tools`.

**Guard usage:**
```mlld
guard @ensureDebiased before sendAdvice = when [
  @mx.tools.history.some(t => t.name == "debiasedEval") => allow
  * => retry "Must run debiasedEval on this data first"
]
```

**`interpreter/hooks/guard-context-snapshot.ts`** — clone function:
Add cloning of `toolProvenance` array (shallow copy since ToolProvenance objects are frozen).

### Files modified
- `interpreter/env/ContextManager.ts` — GuardContextSnapshot, ToolsContextSnapshot, buildAmbientContext
- `interpreter/hooks/guard-candidate-selection.ts` — PerInputCandidate + buildPerInputCandidates
- `interpreter/hooks/guard-operation-keys.ts` — OperationSnapshot + buildOperationSnapshot
- `interpreter/hooks/guard-runtime-evaluator.ts` — populate toolProvenance in guard context
- `interpreter/hooks/guard-context-snapshot.ts` — clone toolProvenance

---

## Phase 4: SDK `mcpServers` Option — DONE (e1bb018a9)

Implemented and committed. `mcpServers` option added to `execute()` and `process()` across TypeScript SDK, Python SDK, and live stdio transport. `McpImportManager.getServer()` checks `env.getMcpServerMap()` before resolving spec as a command.

Files changed: `sdk/execute.ts`, `sdk/types.ts`, `sdk/python/mlld.py`, `interpreter/index.ts`, `interpreter/env/Environment.ts`, `interpreter/mcp/McpImportManager.ts`, `cli/commands/live-stdio-server.ts`, `CHANGELOG.md`, `sdk/README.md`, `sdk/python/README.md`, `docs/src/atoms/sdk/02-sdk--execute.md`, `docs/src/atoms/mcp/05-mcp--import.md`, `docs/src/atoms/cli/05-live-stdio.md`

---

## Phase 5: `var tools @t = mcp @command`

### Goal
Language-level support for dynamically creating a tool collection from an MCP server whose command comes from a variable expression.

### Syntax
```mlld
var tools @t = mcp @payload.mcpCommand
var tools @t = mcp @payload.mcpCommand with labels [dangerous, net:rw]
```

### Current state

**Grammar (`grammar/directives/var.peggy`):**
- Line 9: `toolsSegment:(HWS "tools")?` — parses the `tools` keyword
- Line 15: `isToolsCollection = !!toolsSegment`
- RHS values are parsed by `VarRHSContent` in `grammar/patterns/var-rhs.peggy`
- Tool collection validation in `interpreter/eval/var.ts` line 198-200 enforces object literal RHS

**Evaluation (`interpreter/eval/var/rhs-dispatcher.ts`):**
- Line 264: `if (isToolsCollection)` → routes to `evaluateToolCollectionObject()`
- Tool collections are currently always object literals with exe references as values

**`McpImportService.createMcpToolVariable()`** (`interpreter/eval/import/McpImportService.ts` lines 21-67):
Creates an executable Variable wrapping an MCP tool. Takes: alias, tool schema, mcpName, importPath.

**`McpImportManager.listTools(spec)`** (`interpreter/mcp/McpImportManager.ts` line 69):
Spawns/connects to MCP server, lists available tools, returns `MCPToolSchema[]`.

### Changes

**Grammar — `grammar/patterns/var-rhs.peggy`:**
Add a new production for `mcp @expression` before the general expression handler:
```peggy
/ HWS "mcp" HWS expr:VariableReferenceWithTail {
    return { type: 'mcpToolSource', command: expr };
  }
```

This matches `mcp @payload.mcpCommand`, `mcp @serverSpec`, etc. The `expr` is a standard variable reference with optional tail (`.property`, `[index]`).

The AST node for the var directive would have a value node of type `mcpToolSource` with a `command` child node.

**Grammar — `grammar/directives/var.peggy`:**
May not need changes — the existing var directive already accepts arbitrary VarRHSContent. The `isToolsCollection` flag is set by the `tools` keyword in the LHS. The `with labels` tail modifier is already supported by the var grammar.

Validation in `interpreter/eval/var.ts` (line 198-200) currently rejects non-object RHS for tool collections:
```typescript
if (isToolsCollection && !isObjectLiteral(valueNode)) {
  throw ...
}
```
This needs to also allow the new `mcpToolSource` type.

**Evaluation — `interpreter/eval/var/rhs-dispatcher.ts`:**
Add a new case in the handler switch for `mcpToolSource`:

```typescript
case 'mcpToolSource': {
  // Evaluate the command expression to get a string
  const commandExpr = valueNode.command;
  const commandString = await referenceEvaluator.evaluate(commandExpr);
  const spec = String(commandString);

  // List tools from MCP server
  const manager = env.getMcpImportManager();
  const toolSchemas = await manager.listTools(spec);

  // Build tool collection object from schemas
  const mcpService = new McpImportService(env);
  const toolEntries: Record<string, Variable> = {};
  for (const tool of toolSchemas) {
    const mlldName = mcpNameToMlldName(tool.name);
    const variable = mcpService.createMcpToolVariable({
      alias: mlldName,
      tool,
      mcpName: tool.name,
      importPath: spec,
      definedAt: sourceLocation
    });
    toolEntries[mlldName] = variable;
  }

  return { type: 'resolved', handler: 'mcpToolSource', value: toolEntries };
}
```

This reuses `McpImportService.createMcpToolVariable()` exactly as the import handler does — same `src:mcp` taint, same `@mx.tools.calls` tracking, same guard evaluation. The only difference is the command comes from a variable.

**Variable builder — `interpreter/eval/var/variable-builder.ts`:**
The tool collection normalization at line 330-336 should handle the new value shape (Record<string, Variable> from MCP tools).

**Server lifecycle:**
Each `execute()` call gets its own Environment → its own McpImportManager. The MCP server spawned by `var tools @t = mcp @cmd` is cached in that manager and cleaned up when the environment shuts down. Parallel `execute()` calls get independent servers with independent state.

### Files modified
- `grammar/patterns/var-rhs.peggy` — new `mcpToolSource` production
- `interpreter/eval/var.ts` — allow mcpToolSource for tool collections
- `interpreter/eval/var/rhs-dispatcher.ts` — new handler for mcpToolSource
- `interpreter/eval/var/variable-builder.ts` — handle MCP-sourced tool collections (may need minor adjustment)

---

## Dependency Graph

```
Phase 1 (Audit UUIDs)
  └─> Phase 2 (ToolProvenance on SecurityDescriptor) — needs audit UUIDs for auditRef
       └─> Phase 3 (@mx.tools.history) — needs ToolProvenance on descriptors

Phase 4 (SDK mcpServers) — DONE ✓
  └─> Phase 5 (var tools = mcp @cmd) — benefits from SDK pattern but not strictly dependent
```

Phases 1-3 are one coherent unit. Phase 4 is done. Phase 5 can be implemented standalone.

---

## Verification

### Phase 1 — Audit log
- Run existing tests: `npm test core/security`
- Add unit test for `appendAuditEvent` returning UUID
- Add unit test for `logToolCallEvent` helper
- Manual: run a script with exe calls, verify `.mlld/sec/audit.jsonl` has `toolCall` events with UUIDs
- Verify existing audit events also have UUIDs (no regression)

### Phase 2 — ToolProvenance
- Add unit tests for `mergeDescriptors` with tools arrays (concat, dedup by auditRef, order preservation)
- Add unit tests for `makeSecurityDescriptor` with tools
- Add unit tests for serialize/deserialize round-trip with tools
- Verify tool provenance propagates through a pipeline: `@result = @tool1(@input) | @tool2` — result's descriptor should have both tools

### Phase 3 — @mx.tools.history
- Add fixture test: guard that checks `@mx.tools.history.some(t => t.name == "verify")` — should deny when verify not in chain, allow when it is
- Add fixture test: multi-tool pipeline where guard on final output sees full tool chain
- Verify `@mx.tools.calls` still works unchanged (no regression)

### Phase 4 — SDK mcpServers
- Add unit test: `execute("script.mld", payload, { mcpServers: { "test": "echo '{}'" } })` — verify server map flows to McpImportManager
- Integration test: script with `import tools from mcp "test"` resolves to SDK-provided server

### Phase 5 — var tools = mcp @cmd
- Add fixture test: `var tools @t = mcp @payload.cmd` — verify tool collection populated from MCP server
- Add fixture test: `var tools @t = mcp @payload.cmd with labels [dangerous]` — verify labels applied
- Verify server lifecycle: server starts on var evaluation, cleaned up on execution end
- Verify parallel executions get independent servers
