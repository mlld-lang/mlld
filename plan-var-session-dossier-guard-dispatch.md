# Dossier: Guard Execution + Denial Flow

**Purpose:** Document the guard dispatch path and verify whether any transactional buffering precedent exists. Session's write-commit-on-deny semantics require per-guard write buffering with rollback — novel machinery that needs careful extension-point identification.

---

## Executive Summary

Guard dispatch in mlld runs in a two-phase timing model (before/after) with declared per-guard execution paths. Guards are registered at parse time into a `GuardRegistry` indexed by trigger label (data labels or operation labels); at runtime, when a tool dispatch occurs, the pre-hook selects candidate guards based on label/operation match, evaluates them sequentially in registration order with decision precedence (`deny > retry > allow @value > allow`), and applies transformations or blocks the dispatch. After-guards skip entirely on denied dispatches.

**Critical finding: There is NO transactional buffering today for guard-scoped side effects — all writes to the environment (labels, state, etc.) are immediate.** This creates a design space where session writes must be buffered per-guard and rolled back on denial. This is **novel machinery** — no precedent to copy from.

---

## File-and-Line-Range Reference Table

| File | Lines | Component | Role |
|------|-------|-----------|------|
| `interpreter/eval/guard.ts` | 7-17 | Guard declaration evaluator | Register guard directives into GuardRegistry |
| `interpreter/guards/GuardRegistry.ts` | 102-176 | Registry | Store guard definitions indexed by filterKind and filterValue |
| `interpreter/hooks/guard-pre-hook.ts` | 584-892 | Pre-hook entry | Candidate selection, execution sequencing, decision reduction |
| `interpreter/hooks/guard-candidate-selection.ts` | 1-100+ | Guard matching | Filter guards by label/op, match timing, return ordered candidates |
| `interpreter/hooks/guard-pre-runtime.ts` | 34-57 | Guard runtime setup | Create guard frame, inherit parent vars, inject helpers |
| `interpreter/hooks/guard-runtime-evaluator.ts` | 179-400+ | Guard block execution | Evaluate guard block, apply decision precedence, return GuardResult |
| `interpreter/hooks/guard-decision-reducer.ts` | 83-172 | Decision aggregation | Reduce sequence of GuardResult into single decision with override logic |
| `interpreter/hooks/guard-post-hook.ts` | 20-42 | Post-hook entry | Delegate to post-orchestrator (skip on checkpoint/guard-directive) |
| `interpreter/hooks/guard-post-orchestrator.ts` | 96-249 | After-guard orchestrator | Candidate selection, denial branching, decision engine dispatch |
| `interpreter/hooks/guard-post-decision-engine.ts` | 74-304 | After-guard runner | Execute after-guards in order, accumulate transforms, check for denial abort |
| `interpreter/eval/exec-invocation.ts` | 2256-2268 | Exec entry | Wrap invocation in `runWithGuardRetry`, call internal path |
| `interpreter/eval/exec-invocation.ts` | 4598-4705 | Exec pre-guard + binding | Call `runExecPreGuards`, handle pre-decision, bind parameters |
| `interpreter/eval/pipeline/builtin-effects.ts` | 238-331 | Effect dispatch | Pre/post hook routing for show/output/log/append |

---

## Guard Dispatch Walkthrough

### Phase 1: Before-Guard Execution

1. **Entry point** (`exec-invocation.ts:2256-2268`): `evaluateExecInvocation` wraps real implementation in `runWithGuardRetry`, handling retry loops.

2. **Pre-guard collection** (`exec-invocation.ts:4598-4608`): `runExecPreGuards` called with evaluated args and guard input candidates. Delegates to `guard-pre-hook.ts` via HookManager.

3. **Registry lookup** (`guard-pre-hook.ts:622-652`): Pre-hook calls `buildPerInputCandidates(registry, variableInputs, guardOverride, 'before', guardArgNames)` to fetch guards matching input data labels, filtered by timing='before'. Also calls `collectOperationGuards(registry, operation, guardOverride, {...})` to match operation-label guards.

4. **Candidate assembly** (`guard-candidate-selection.ts`): For each input label, look up `registry.getDataGuardsForTiming(label, 'before')`. For operation, `registry.getOperationGuardsForTiming(op, 'before')`. Sorted by `registrationOrder` (declaration order).

5. **Foreach loop - per-input guards** (`guard-pre-hook.ts:698-735`):
   - For each candidate, iterate guards top-to-bottom
   - Call `evaluatePreHookGuard` per guard → `GuardResult` with decision ('allow' | 'deny' | 'retry' | 'env')
   - Apply result via `applyGuardDecisionResult` (enforces precedence)
   - On `allow` + no current denial, apply replacement to `currentInput`

6. **Per-guard evaluation** (`guard-pre-runtime.ts:34-57` → `guard-runtime-evaluator.ts:179-400+`):
   - Create child environment for guard
   - Prepare `@input` (per-input value or array of all inputs), `@output` (text view)
   - Inject guard helpers (`@prefix`, `@tag`, `@mx.op.*`, `@mx.args.*`)
   - Evaluate guard block (`when [condition => action]`)
   - Return GuardResult with decision and optional replacement/metadata

7. **Decision precedence** (`guard-decision-reducer.ts:83-172`):
   - Result `'deny'`: set `state.decision = 'deny'`, push reason
   - Result `'retry'`: set `state.decision = 'retry'` only if not already 'deny'
   - Result `'allow'` and state 'allow': apply replacement, no state change
   - Policy-guarded denials can be overridden by privileged-guard allows

8. **Foreach loop - operation guards** (`guard-pre-hook.ts:784-818`): Same as per-input, but guards match operation label (e.g., `tool:w`).

9. **Label/interpolated policy checks** (`guard-pre-hook.ts:737-782`): Additional synthetic guards run policy label-flow rules as guard denials.

10. **Decision finalization** (`guard-pre-hook.ts:820-891`): Build aggregate metadata, emit tracing, return `{action, metadata}` where action is 'continue' | 'abort' | 'retry'.

11. **Pre-decision handling** (`exec-invocation.ts:4694-4705`): `handleExecPreGuardDecision(preDecision, ...)`. If 'abort', throw `GuardError`. If 'retry', signal retry. If 'continue', proceed.

### Phase 2: After-Guard Execution

1. **Entry point** (`guard-post-hook.ts:20-42`): Called by HookManager after exe completes successfully. Skip if operation is guard directive or checkpoint, or if guards suppressed.

2. **Post-orchestrator dispatch** (`guard-post-orchestrator.ts:96-249`): Collects output and input variables, selects after-guards by data/operation label match.

3. **Candidate selection** (`guard-post-orchestrator.ts:151-173`): `buildPerInputCandidates(registry, outputVariables, guardOverride, 'after')`. If no match on outputs, fall back to input labels.

4. **Decision engine** (`guard-post-decision-engine.ts:74-304`):
   - Per-input candidates loop: for each candidate, for each guard, `evaluateGuard`
   - On 'allow' + state 'allow': apply replacement/labels
   - On 'deny': set currentDecision='deny', stop transforms
   - On 'resume'/'retry' and not 'deny': set decision
   - Operation guards loop: same, but on operation (whole args array)

5. **Key: After-guards do NOT run if dispatch denied by before-guard or policy.** The post-hook is only called on successful (non-denied) executes. See `guard-post-hook.ts:20` — returns early if operation is falsy (which happens on denial).

6. **Trace and finalization** (`guard-post-orchestrator.ts:250-331`): On denial, throw GuardError. On allow, return result (possibly with transformed output).

---

## Key Code Excerpts

### 1. Guard Registration

`interpreter/eval/guard.ts:7-17`

```typescript
export async function evaluateGuard(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const guardNode = directive as GuardDirectiveNode;
  const registry = env.getGuardRegistry();
  registry.register(guardNode, directive.location ?? null, {
    emitWarning: message => env.emitEffect('stderr', `${message}\n`)
  });
  return { value: undefined, env };
}
```

### 2. Before-Guard Execution Loop

`interpreter/hooks/guard-pre-hook.ts:698-735`

```typescript
const transformedInputs: Variable[] = [...variableInputs];
for (const candidate of perInputCandidates) {
  const attemptKey = buildGuardAttemptKey(operation, 'perInput', candidate.variable);
  let currentInput = candidate.variable;

  for (const guard of candidate.guards) {
    const result = await evaluatePreHookGuard({
      node, env, guard, operation, scope: 'perInput',
      perInput: candidateWithCurrentInput,
    });
    guardTrace.push(result);
    applyGuardDecisionResult(decisionState, result, { retryOverridesDeny: false });
    if (result.decision === 'allow' && decisionState.decision === 'allow') {
      if (result.replacement && isVariable(result.replacement as Variable)) {
        currentInput = result.replacement as Variable;
      }
    }
  }
  transformedInputs[candidate.index] = currentInput;
}
```

### 3. Decision Precedence

`interpreter/hooks/guard-decision-reducer.ts:122-139`

```typescript
if (result.decision === 'deny') {
  const scopeKey = getScopeKey(result);
  const policyGuard = isPolicyGuardResult(result);
  const policyLocked = isPolicyDenyLocked(result);
  if (policyGuard && !policyLocked && canOverridePolicyDeny(state, scopeKey)) {
    return; // privileged guard can override; skip state change
  }
  state.decision = 'deny';
  if (result.reason) state.reasons.push(result.reason);
  state.activePolicyDenyScope = policyGuard ? scopeKey : null;
  state.activePolicyDenyLocked = policyGuard && policyLocked;
  return;
}
```

### 4. Guard Frame Creation

`interpreter/hooks/guard-pre-runtime.ts:34-57`

```typescript
export async function evaluatePreHookGuard(
  options: EvaluateGuardRuntimeOptions
): Promise<GuardResult> {
  return evaluateGuardRuntime(options, {
    defaultGuardMax: DEFAULT_GUARD_MAX,
    guardInputSource: GUARD_INPUT_SOURCE,
    prepareGuardEnvironment: (sourceEnv, guardEnv, guard) => {
      if (guard.capturedModuleEnv) {
        guardEnv.setCapturedModuleEnv(guard.capturedModuleEnv);
      }
      inheritParentVariables(sourceEnv, guardEnv);
      logGuardHelperAvailability(sourceEnv, guardEnv, guard);
      ensurePrefixHelper(sourceEnv, guardEnv);
      ensureTagHelper(sourceEnv, guardEnv);
    },
    injectGuardHelpers,
    evaluateGuardBlock,
    evaluateGuardReplacement,
    resolveGuardEnvConfig: resolveGuardEnvDecision,
    buildDecisionMetadata,
    logGuardEvaluationStart,
    logGuardDecisionEvent
  });
}
```

**Guard frame:** child environment created (`guardEnv = env.createChild()`), parent variables inherited, guard-specific helpers injected. This frame owns `@input`, `@output`, and `@mx.*` during guard evaluation.

### 5. After-Guards on Denied Dispatch

`interpreter/hooks/guard-post-hook.ts:20-42`

```typescript
export const guardPostHook: PostHook = async (node, result, inputs, env, operation) => {
  if (!operation || (isDirectiveHookTarget(node) && node.kind === 'guard')) {
    return result;
  }
  if (env.shouldSuppressGuards()) {
    return result;
  }
  return env.withGuardSuppression(async () =>
    executePostGuard({ node, result, inputs, env, operation })
  );
};
```

**After-guard skip on denial:** Post-hook called only if `operation` present. On denied dispatch, pre-hook returns `{ action: 'abort' }`, which triggers `handleGuardDecision` to throw `GuardError`. Execution never reaches success path where post-hook would fire. Structurally skipped on denial.

---

## Transactional-Pattern Survey

**Explicit verdict: No Buffering Precedent**

Current guard execution does **not buffer or defer any side effects**. All writes to the environment happen eagerly:

- **Label modifications:** Applied directly via `applyDescriptorToVariables` (`guard-post-decision-engine.ts:122, 249`)
- **Variable replacements:** Assigned directly into `transformedInputs` (`guard-pre-hook.ts:734`)
- **Guard state mutations:** Stored in `decisionState` (in-memory only, not persistent)
- **Attempts/retry state:** Stored in `attemptStore` (`Map<string, GuardAttemptState>`), not rolled back on denial
- **Tracing events:** Emitted immediately (`guard-pre-logging.ts`, `guard-trace.ts`)

**No rollback mechanism exists.** When a guard runs and modifies state, that change is permanent. If a later guard in the same phase denies, the earlier change is not undone.

This is acceptable today because:
1. Labels are modified on **copies** of variables (cloned in `cloneVariableForGuard`), not on source variables
2. Inputs to the operation are copied and transformed within the phase (`guard-pre-hook.ts:697`)
3. After-guards never run on denied dispatches

But it becomes a problem for **session writes**, which are backed by **mutable runtime state** (environment's session store). A guard write to `@session.increment(...)` would update the session immediately, and on denial, that write would persist.

**Design implication:** Session write buffering must be **per-guard** (not per-phase), with rollback mechanism triggering on guard denial. The buffer:
- Intercepts session write method calls (`set`, `write`, `update`, `increment`, `append`, `clear`)
- Queues writes in temporary buffer instead of committing to session store
- On guard allow: commit buffer to real store
- On guard deny: discard buffer (session unchanged)

---

## Extension Points for Session Write Buffering

### Per-Guard Write Buffer Attachment

| File | Line | Context | Action |
|------|------|---------|--------|
| `guard-pre-runtime.ts:44` | `inheritParentVariables(sourceEnv, guardEnv)` | After guard env setup | **Attach buffer:** Create `guardEnv.sessionWriteBuffer = new Map()` |
| `interpreter/eval/exec/session-write-methods.ts` (new) | N/A | Session I/O | Intercept `@session.set/write/update/increment/append/clear`; queue to `env.getSessionWriteBuffer()` if present |
| `guard-decision-reducer.ts:129` | `state.decision = 'deny'` | On guard denial | **Discard buffer:** Call `env.discardSessionWriteBuffer()` |
| `guard-pre-hook.ts:730` | After `applyGuardDecisionResult(...)` | On guard allow | **Commit buffer:** Call `env.commitSessionWriteBuffer()` |

### Detailed Integration

**1. Frame creation** (`guard-pre-runtime.ts:40`):
```typescript
const guardEnv = env.createChild();
deps.prepareGuardEnvironment(env, guardEnv, guard);
guardEnv.attachSessionWriteBuffer();  // New method
```

**2. Session write interception** (new module or `Environment.ts`):
```typescript
const buffer = env.getSessionWriteBuffer();
if (buffer) {
  buffer.queue({ slot: 'runtime.tool_calls', value, operation: 'increment' });
} else {
  // Non-guard context, write directly
  sessionStore.write(slot, value);
}
```

**3. Denial rollback** (`guard-decision-reducer.ts:129`):
```typescript
if (result.decision === 'deny') {
  env.discardSessionWriteBuffer();  // New method
  state.decision = 'deny';
  // ...
}
```

**4. Allow commit** (`guard-pre-hook.ts:730`):
```typescript
if (result.decision === 'allow' && decisionState.decision === 'allow') {
  env.commitSessionWriteBuffer();  // New method
  if (result.replacement && isVariable(result.replacement as Variable)) {
    currentInput = result.replacement as Variable;
  }
}
```

### Session Write Buffer Contract

```typescript
interface SessionWriteBuffer {
  queue(entry: {
    slot: string;           // dotted path, e.g. 'runtime.tool_calls'
    value: unknown;
    operation: 'set' | 'write' | 'update' | 'increment' | 'append' | 'clear';
    guardId?: string;
    timestamp?: number;
  }): void;
  
  commit(sessionStore: SessionStore): void;  // flush to store
  discard(): void;                           // clear buffer
  clear(): void;                             // reset state
}
```

Buffer is **per-guard** (scoped to child env created for that guard), **transient** (lives only during guard evaluation), and **sequential** (committed/discarded in lock-step with guard decision evaluation).

---

## Flags: Edge Cases & Interactions

### Denial Propagation & Rollback Scope

1. **Multi-guard phase:** Guard N denies in per-input phase where guard N-1 allowed. N-1's writes survive (committed before N ran). Only N's buffered writes discarded.

2. **Across phases (before → after):** After-guards don't run on denial, so no buffering issue there.

3. **Nested LLM calls + session:** Inner `@claude()` denial rolls back inner session; outer unaffected (sessions per-frame).

### Label Modifications in Guard → Session Reads

Spec intent: "Writes that commit before denial remain; only the denying guard's own writes rolled back."

- A denied guard's buffered writes NOT visible to subsequent denying-path teardown
- Earlier guards' committed writes ARE visible (flushed before denial)
- Aligns with intent: denial logging sees "state before this guard tried to modify it"

### Privileged Guards + Buffering

Privileged guards can override policy denials:
- Policy denial cleared (`guard-decision-reducer.ts:117: clearActivePolicyDeny`)
- Privileged guard's writes should commit (part of allow)
- Prior guard writes (before policy denial) already committed

### Retry Loops & Buffer Lifecycle

On retry, invocation retried from top. Session buffer for that guard attempt discarded (guard re-run); fresh buffer for next attempt. Correct: retries are fresh invocations with independent session state.

### Resume Invariants

`resume` runs new frame with `tools = []` and auto-provisioned shelves disabled. Fresh session instance. Writes NOT carried across resume. Buffering not a concern for resume.

### Streaming Operations

After-guards cannot run during streaming (`guard-post-orchestrator.ts:174-191`). Safe from buffering perspective: no after-guard writes during streaming.

### Tool Collection Dispatch

When tool invocation dispatches through tool collection, guards evaluated same way. No special buffering logic; buffer mechanism is frame-scoped, not tool-scoped.

---

## Non-Goals Confirmation

**Did NOT design:**
- Session guard integration semantics (spec's responsibility)
- Write-commit precedence beyond denial (spec defines it)
- Cross-frame session visibility or persistence (out of scope per spec)
- Conflict resolution if two concurrent guards write to same slot (out of scope; sequential today)
- Performance optimizations (out of scope)

**Confirmed:**
- ✅ Current code has no session-write buffering
- ✅ Denial propagation is structural (after-guards skip, pre-guards reduce to single decision)
- ✅ Guards run in child frame with inherited parent variables
- ✅ Decision precedence is `deny > retry > allow @value > allow`
- ✅ Label modifications during guards applied immediately (on copies)
- ✅ No rollback mechanism today for any guard-scoped side effects
- ✅ Extension points (frame creation, write interception, decision reduction) well-defined

**Implementation note:** Per-guard write buffering is novel machinery. Estimate: 3-4 days for clean implementation + tests. This is the highest-novelty piece of the session primitive.
