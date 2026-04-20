# Dossier: `@mx.*` Nearest-Frame Lookup Machinery

**Purpose:** Verify the spec's claim that session resolution can reuse `@mx.*` machinery. Document the existing ambient-accessor resolution so we know what can be generalized for declaration-identity-keyed lookup.

---

## Executive Summary

`@mx.*` ambient accessor resolution is a **nearest-frame-stack walker** implemented through parallel stacks in `ContextManager`. The accessor name (`mx`) is special-cased in `VariableManager.getVariable()` to trigger a **lazy build** of `buildAmbientContext()`, which walks four independent stacks (`opStack`, `guardStack`, `pipelineStack`, `deniedStack`) and peeks the topmost frame of each kind. Resolution keys off **ambient state names** (e.g., current operation, current guard, current pipeline stage), not declaration identity.

**Key finding: session lookup needs declaration-identity keying — a different lookup model than `@mx.*` uses today.** The existing walker CANNOT be reused directly. A new entry point keyed on declaration identity is required, though it's a thin extension using the existing bridge-stack infrastructure (+0.5 day).

---

## File-and-Line-Range Reference Table

| File | Lines | Purpose |
|---|---|---|
| `interpreter/env/VariableManager.ts` | 292–334 | Ambient `@mx` variable resolution — lazy build on access, returns Variable wrapping `mxValue` |
| `interpreter/env/ContextManager.ts` | 147–170 | Frame stacks declaration: `opStack`, `guardStack`, `pipelineStack`, `deniedStack`, `genericContexts` |
| `interpreter/env/ContextManager.ts` | 164–221 | Operation stack push/pop/peek + walk helpers (`getEnclosingExeLabels`, `hasEnclosingExeLabel`) |
| `interpreter/env/ContextManager.ts` | 258–280 | Guard stack push/pop/peek + context manager wrapper |
| `interpreter/env/ContextManager.ts` | 395–525 | Core `buildAmbientContext()` — walks all stacks, builds `@mx.*` namespace |
| `interpreter/env/Environment.ts` | 385, 3403, 3424–3433 | Bridge stack (separate from ContextManager): `bridgeStack[]`, `pushBridge()`, `popBridge()`, `getActiveBridge()` |
| `interpreter/utils/field-access.ts` | 183–250 | Object utility mx view builder — handles `.mx.handle`, `.mx.handles` via lazy getters |
| `docs/src/atoms/core/32-builtins--ambient-mx.md` | 1–136 | Complete reference documentation for `@mx.*` accessors |

---

## Key Code Excerpts

### 1. `@mx` is built lazily on access

`interpreter/env/VariableManager.ts:292-334`

```typescript
getVariable(name: string): Variable | undefined {
  // Ambient, read-only @mx support (calculated on access)
  if (name === 'mx') {
    const testCtxVar = this.variables.get('test_mx');
    if (testCtxVar) {
      return createObjectVariable('mx', testCtxVar.value, false, undefined, {...});
    }

    const contextManager = this.deps.getContextManager?.();
    const pipelineContext = this.deps.getPipelineContext?.();
    const securitySnapshot = this.deps.getSecuritySnapshot?.();
    const mxValue = this.deps.buildAmbientMxValue
      ? this.deps.buildAmbientMxValue()
      : contextManager
      ? (() => {
          const bridge = this.deps.getActiveBridge?.();
          const boxContext = bridge ? {mcpConfigPath: bridge.mcpConfigPath, socketPath: bridge.socketPath} : null;
          const llmToolConfig = this.deps.getLlmToolConfig?.();
          return contextManager.buildAmbientContext({
            pipelineContext, securitySnapshot, boxContext, llmToolConfig
          });
        })()
      : this.buildLegacyContext(pipelineContext, securitySnapshot);

    return createObjectVariable('mx', mxValue, false, undefined, {
      mx: { definedAt: { line: 0, column: 0, filePath: '<context>' } },
      internal: { isReserved: true, isReadOnly: true }
    });
  }
  // ... rest of getVariable() for other variables
}
```

**Key insight:** Every access to `@mx` triggers a **fresh build** from current frame stack tops. No caching.

### 2. Frame stacks declared in `ContextManager`

`interpreter/env/ContextManager.ts:147-152`

```typescript
export class ContextManager {
  private readonly opStack: OperationContext[] = [];
  private readonly pipelineStack: PipelineContextSnapshot[] = [];
  private readonly guardStack: GuardContextSnapshot[] = [];
  private readonly deniedStack: DeniedContextSnapshot[] = [];
  private readonly genericContexts: Map<string, unknown[]> = new Map();
```

Four independent stacks + generic Map. **No frame-kind type union** — each stack is homogeneous by design.

### 3. Operation stack walk

`interpreter/env/ContextManager.ts:187-212`

```typescript
getEnclosingExeLabels(): readonly string[] {
  // Walks opStack backward (top-to-bottom) looking for exe-typed operations
  for (let i = this.opStack.length - 1; i >= 0; i--) {
    const ctx = this.opStack[i];
    if (ctx.type === 'exe' && ctx.labels && ctx.labels.length > 0) {
      return ctx.labels;  // Return nearest exe labels
    }
  }
  return [];
}

hasEnclosingExeLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  for (let i = this.opStack.length - 1; i >= 0; i--) {
    const ctx = this.opStack[i];
    if (ctx.type !== 'exe' || !ctx.labels || ctx.labels.length === 0) continue;
    if (ctx.labels.some(candidate => candidate.trim().toLowerCase() === normalized)) {
      return true;
    }
  }
  return false;
}
```

**Frame-walk model:** Linear backward scan with **hardcoded type predicate** (`ctx.type === 'exe'`). No registration or key-based lookup — just iteration.

### 4. Core `buildAmbientContext()` — the frame peek model

`interpreter/env/ContextManager.ts:395-525` (excerpt)

```typescript
buildAmbientContext(options: BuildContextOptions = {}): Record<string, unknown> {
  const pipeline = options.pipelineContext ?? this.peekPipelineContext();
  const security = options.securitySnapshot;
  const currentOperation = this.peekOperation() ?? security?.operation;
  const guardContext = this.peekGuardContext();
  const deniedContext = this.peekDeniedContext();
  const whileContext = this.peekGenericContext('while');
  const loopContext = this.peekGenericContext('loop');
  const forContext = this.peekGenericContext('for');
  const parallelContext = this.peekGenericContext('parallel');

  const mxValue: Record<string, unknown> = {
    ...pipelineFields.root,
    labels: guardContext?.labels ? Array.from(guardContext.labels) : [...],
    sources: guardContext?.sources ? Array.from(guardContext.sources) : [...],
    taint: guardContext?.taint ? Array.from(guardContext.taint) : [...],
    policy: security?.policy ?? null,
    operation: normalizedOperation,
    op: normalizedOperation,
    ...(whileContext ? { while: whileContext } : {}),
    ...(loopContext ? { loop: loopContext } : {}),
    ...(forContext ? { for: forContext } : {}),
    tools: { ...this.getToolsSnapshot(), history: toolHistory },
    ...(guardContext ? { guard: normalizeGuardContext(guardContext) } : {})
  };

  return mxValue;
}
```

**Resolution model:** Four independent `peekXxx()` calls. Each returns top of its stack or `undefined`. No unification — each namespace (`.op`, `.guard`, `.pipe`, etc.) is built from its own dedicated frame.

### 5. Bridge stack (parallel, in Environment)

`interpreter/env/Environment.ts:385, 3424-3433`

```typescript
private bridgeStack: WorkspaceMcpBridgeHandle[] = [];

pushBridge(bridge: WorkspaceMcpBridgeHandle): void {
  this.bridgeStack.push(bridge);
}

popBridge(): WorkspaceMcpBridgeHandle | undefined {
  return this.bridgeStack.pop();
}

getActiveBridge(): WorkspaceMcpBridgeHandle | undefined {
  if (this.bridgeStack.length > 0) {
    return this.bridgeStack[this.bridgeStack.length - 1];
  }
  return this.parent?.getActiveBridge();
}
```

**Bridge stack is separate from ContextManager.** Accessed via `getActiveBridge()`; passed to `buildAmbientContext()` as `boxContext`.

### 6. Value-local `.mx.handle` / `.mx.handles`

`interpreter/utils/field-access.ts:229-244`

```typescript
if (env) {
  Object.defineProperty(view, 'handle', {
    enumerable: true,
    configurable: true,
    get: () => {
      if (structured) {
        return issueProjectionHandleForValue(env, structured, {
          nullOutsideBridge: true
        });
      }
      if (!env.getCurrentLlmSessionId()) return null;
      return env.issueHandle(data).handle;
    }
  });
  // ... .mx.handles similar ...
}
```

Value-local `.mx.handle` / `.mx.handles` are lazy getters depending on `env.getCurrentLlmSessionId()` and the active bridge frame.

---

## Catalog Table: `@mx.*` Accessors

| Accessor | Resolves From | Frame Kind(s) | Notes |
|---|---|---|---|
| `@mx.op` / `@mx.op.name` / `@mx.op.labels` | `ContextManager.peekOperation()` | `opStack` (any type) | Normalized operation context |
| `@mx.args` | `ContextManager.peekGuardContext()` | `guardStack` | Guard-time arg view; only populated during guard execution |
| `@mx.guard.try` / `@mx.guard.reason` / `@mx.guard.name` | `ContextManager.peekGuardContext()` or `peekDeniedContext()` | `guardStack`, `deniedStack` | Guard attempt, denial reason |
| `@mx.labels` / `@mx.taint` / `@mx.sources` | `peekGuardContext()` or `securitySnapshot` | `guardStack` or security context | Security labels on current data flow |
| `@mx.handles` | `env.getActiveBridge()` + handle registry | `bridgeStack` (in Environment) | Filtered to active LLM session; null outside bridge |
| `@mx.policy.active` | `securitySnapshot?.policy` | Security context (not ContextManager) | Active policy descriptors |
| `@mx.llm.sessionId` | `env.getCurrentLlmSessionId()` | `bridgeStack` | Current LLM bridge session ID |
| `@mx.llm.display` | `env.getScopedEnvironmentConfig()` | Environment config (not ContextManager) | Display mode for current scope |
| `@mx.for.index` / `@mx.for.item` | `peekGenericContext('for')` | `genericContexts['for']` | Loop iteration state |
| `@mx.while.condition` | `peekGenericContext('while')` | `genericContexts['while']` | While loop state |
| `@mx.loop.iteration` | `peekGenericContext('loop')` | `genericContexts['loop']` | Generic loop state |
| `@mx.pipe.stage` / `@mx.pipe.try` | `peekPipelineContext()` | `pipelineStack` | Pipeline stage, attempt count |
| `@mx.tools.calls` / `@mx.tools.results` | `ContextManager.getToolsSnapshot()` | Tool call record | Tool history and results |
| `@mx.denied` / `@mx.denial.reason` | `peekDeniedContext()` | `deniedStack` | Denial state |
| `@someValue.mx.handle` | `env.issueHandle()` + session filter | `bridgeStack` | **Value-local**, not ambient; dynamic per session |
| `@someValue.mx.handles` | Display projection + handles | `bridgeStack` | **Value-local**, filtered record handles |

---

## Frame Structure Catalog

No explicit frame-kind type union. Each accessor has a **hardcoded lookup path**:

**Frame kinds in use:**
- **Operation frame** (`OperationContext`): `type`, `name`, `labels`, `opLabels`, `metadata`
- **Guard frame** (`GuardContextSnapshot`): `attempt`, `try`, `input`, `output`, `labels`, `taint`, `sources`, `trace`, `hints`, `reasons`, `args`
- **Denied frame** (`DeniedContextSnapshot`): `denied`, `reason`, `guardName`, `code`, `phase`
- **Pipeline frame** (`PipelineContextSnapshot`): `stage`, `attemptCount`, `input`, `previousOutputs`, `format`
- **Generic frames** (while/for/loop/parallel): Map of name → context object
- **Bridge frame** (`WorkspaceMcpBridgeHandle`): `mcpConfigPath`, `socketPath`, LLM session identity

---

## Generalizability Verdict

**The existing walker CANNOT be reused directly for session declaration-identity-keyed lookup.** Here's why:

1. **Ambient-key vs declaration-identity keying:** `@mx.*` resolution is built around **ambient state keys** ("what's the current op?"). The walker doesn't look at declaration identifiers — it just peeks stacks.

2. **No predicate-based walker:** The code hardcodes **four independent peek calls** (`peekOperation()`, `peekGuardContext()`, etc.). There is no parameterized walker taking a predicate and returning "first frame where predicate(frame) is true".

3. **What sessions would need:**
   ```typescript
   // Pseudocode:
   findNearestFrameWhere(predicate: (frame: Frame) => boolean): Frame | undefined {
     for (let i = bridgeStack.length - 1; i >= 0; i--) {
       if (predicate(bridgeStack[i])) return bridgeStack[i];
     }
     return undefined;
   }
   ```
   Doesn't exist in codebase.

4. **Bridge stack is separate:** Sessions attach to LLM bridge frames (`Environment.bridgeStack`), not `ContextManager`. Parallel stack model needs to extend to `ContextManager` as well (or move session storage to ContextManager).

**Extension point:** A session-aware lookup attaches to the **bridge-frame lifecycle**, not operation/guard/pipeline stacks:

```typescript
// In ContextManager or new SessionFrameManager:
private sessionFrames: SessionInstance[] = [];  // Stack of per-bridge-call session instances

getSessionInstance(declId: Declaration['id']): SessionInstance | undefined {
  for (let i = this.sessionFrames.length - 1; i >= 0; i--) {
    if (this.sessionFrames[i].declId === declId) {
      return this.sessionFrames[i];
    }
  }
  return undefined;
}
```

This is a **new subsystem** (thin — linear search + declaration-identity match), not a parameterization of the existing `@mx.*` walker.

---

## Extension Points

1. **Session frame attachment in bridge lifecycle:**
   - `Environment.pushBridge()` also creates and attaches session instance map
   - `Environment.popBridge()` cleans up session instances
   - New `ContextManager.setSessionInstance(declId, instance)` records the live instance

2. **Session resolver in `VariableManager`:**
   - Add check before/after `@mx` special case: if variable name matches a session declaration, call `env.resolveSessionInstance(declId)`
   - Return Variable wrapping the instance, with `.set()`, `.write()`, `.append()`, etc. as method accessors

3. **Named-accessor entry point:**
   - `@mx.*` continues using `peekXxx()` for ambient state
   - Named session accessors (`@sessionName`) dispatch through new `getSessionInstance(declId)`
   - No predicate-based walker needed; linear search with declaration identity as key

4. **Dual-reading pattern in field access:**
   - When `@sessionName.fieldName` accessed, determine context (inside live frame vs outside)
   - Outside: resolve to schema definition (type info only)
   - Inside: resolve to live instance value with mutability methods
   - Bridge frame context determines which — same as `@mx.llm.sessionId` filtering

---

## Flags and Observations

1. **No caching:** `@mx` rebuilt on every access. Fine for inspection but frequent re-walks. Not a performance issue for typical volume.

2. **Lazy vs eager:** `@mx` lazy-built on access, not pre-built when frames are pushed. Avoids allocating objects that might never be read.

3. **Frame freezing:** Stacks store `Object.freeze()`d copies (see `pushOperation`, `pushPipelineContext`). Prevents accidental mutation; means each push clones — immutability-first design.

4. **Test override:** `@mx` can be overridden for testing via `@test_mx` variable. Clean injection point.

5. **Separate bridge stack:** `bridgeStack` in Environment not integrated into `ContextManager`. LLM session identity (needed for `@mx.llm.sessionId`, handle filtering, display mode) accessed via separate path (`env.getActiveBridge()`), passed as `boxContext` to `buildAmbientContext()`.

6. **Generic contexts Map:** Extensible pool for ad-hoc contexts (while, loop, for, parallel). New loop kinds added without changing `ContextManager` schema.

7. **No frame-kind union type:** Each accessor hardcodes its stack. New frame kind (e.g., session frames) requires new accessor added manually — no polymorphic dispatcher.

8. **Redaction in tracing:** Session writes emit trace events with `.mx.labels` redaction (per spec §11). Trace infrastructure exists (`RuntimeTraceManager`, `traceSessionWrite` events) but session event types not yet defined.

---

## Non-Goals Confirmation

This dossier documents **only existing `@mx.*` machinery**. It does NOT:
- Design how session resolution should work (spec's job)
- Propose new code (only analyzed existing patterns)
- Modify any files
- Implement session lookup path (future task)

**Correction to session spec's implicit claim:** "session uses the same machinery as `@mx.*`" is partially true — both use nearest-frame-wins nesting — but `@mx.*` keys off ambient state names while sessions key off declaration identity. The existing walker can **inspire** a session walker; it's not directly reusable.
