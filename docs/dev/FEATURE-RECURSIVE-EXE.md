# Feature Request: Recursive `exe` Functions

**Status:** Proposed  
**Discovered via:** fractals/mlld port (2026-03-06)  
**Related:** `interpreter/eval/exec-invocation.ts`, `core/errors/CircularReferenceError.ts`

---

## Problem

`exe` functions cannot call themselves. Attempting to do so throws a `CircularReferenceError` at the first recursive call site:

```
CircularReference: Circular reference detected: executable '@countdown'
calls itself recursively without a terminating condition
```

This is a hard block, not a depth-limit — any self-call, even one with a clear terminating condition, is rejected.

The check lives in `interpreter/eval/exec-invocation.ts` around line 454, using `env.isResolving(commandName)` — a flat boolean that can't distinguish "infinite loop" from "bounded recursion with a base case."

---

## Motivation

The canonical use case is **tree traversal** — specifically, recursive task decomposition as in the [fractals orchestrator pattern](https://github.com/TinyAGI/fractals).

The natural mlld expression of this is:

```mlld
exe @plan(task) = [
  when @task.depth >= @maxDepth => @withKind(@task, "atomic")
  let @kind = @classify(@task)
  when @kind == "atomic" => @withKind(@task, "atomic")
  let @children = @decompose(@task)
  let @planned  = for parallel(5) @child in @children => @plan(@child)
  => @withChildren(@task, @planned)
]

var @tree = @plan(@root)
```

This is ~10 lines, reads exactly like the algorithm, and gets all mlld features for free: `exe llm` caching, checkpointing, `for parallel` fan-out at each level.

Without recursive `exe`, the workaround is `while` + frontier accumulation:

```mlld
exe @expand(state) = [
  let @frontier = @state.frontier
  when @frontier.length == 0 => done @state
  let @classified   = for parallel(5) @t in @frontier [...]
  let @expanded     = for parallel(5) @t in @classified [...]
  let @nextFrontier = js { return expanded.flatMap(t => t.children || []) }
  let @nextAll      = js { return [...state.all, ...expanded] }
  continue { frontier: @nextFrontier, all: @nextAll, ... }
]
var @final = @initial | while(20) @expand
var @tree  = @assembleTree(@root, @final.all)   // reassemble after the fact
```

The `while` workaround works but introduces three kinds of accidental complexity:

1. **Frontier management** — manually threading state that the call stack handles implicitly in a recursive model
2. **BFS instead of DFS** — a semantic compromise forced by the loop model; `while` processes level N before level N+1, but the correct shape is concurrent DFS (`Promise.all` on children, each subtree resolving independently)
3. **Post-hoc reassembly** — `@assembleTree` exists only because the loop flattened a structure that recursive calls would have built naturally

---

## Proposed Design

### Syntax

No new syntax required. Recursive `exe` functions look identical to non-recursive ones — the function just calls itself:

```mlld
exe @plan(task) = [
  when @task.depth >= @maxDepth => @withKind(@task, "atomic")
  ...
  let @planned = for parallel(5) @child in @children => @plan(@child)
  => @withChildren(@task, @planned)
]
```

### Depth Limit

Replace the flat `isResolving` boolean with a per-name call depth counter. Allow recursion up to a configurable limit, then throw:

```
RecursionDepthExceeded: '@plan' exceeded maximum call depth (64).
Add a base case or increase the limit with /set recursionDepth 128.
```

Default limit: **64** (generous for real use cases, catches true infinite loops quickly).  
Override: `/set recursionDepth N` at the script level, or a CLI flag `--recursion-depth N`.

### Semantics

- **Concurrent recursion is allowed.** `for parallel(N) @child in @children => @plan(@child)` spawns N concurrent recursive calls. Each branch tracks its own depth independently. This is the key feature — it's what enables concurrent DFS.
- **Depth is per-branch, not global.** A call at depth 3 that spawns 5 children all start at depth 4. Siblings don't share a depth counter.
- **`exe llm` functions can be recursive.** The LLM cache key is per call-site and arguments, so recursive `exe llm` calls get caching at each node naturally.
- **Checkpoints work as expected.** A checkpoint inside a recursive function caches per-invocation.

### What Changes in the Implementation

In `interpreter/eval/exec-invocation.ts`:

```ts
// Current (flat boolean):
if (shouldTrackResolution && env.isResolving(commandName)) {
  throw new CircularReferenceError(...)
}
env.beginResolving(commandName)

// Proposed (depth counter):
const currentDepth = env.getResolutionDepth(commandName);
const maxDepth = env.getRecursionLimit(); // default 64
if (currentDepth >= maxDepth) {
  throw new RecursionDepthExceededError(commandName, maxDepth);
}
env.incrementResolutionDepth(commandName);
// ... execute ...
env.decrementResolutionDepth(commandName);
```

`env.isResolving` → `env.getResolutionDepth` (returns 0 when not in progress).  
`env.beginResolving/endResolving` → `env.incrementResolutionDepth/decrementResolutionDepth`.

The `Environment` class needs a `Map<string, number>` for call depths instead of a `Set<string>` for in-progress names. The change is localized.

---

## Comparison: `while` vs recursive `exe`

| | `while` (today) | recursive `exe` (proposed) |
|---|---|---|
| Reads like the algorithm | ❌ state threading, frontier mgmt | ✅ yes |
| Traversal order | BFS (level by level) | DFS (concurrent, like Promise.all) |
| Parallel fan-out | ✅ `for parallel` | ✅ `for parallel` inside recursive call |
| Tree assembles itself | ❌ needs post-hoc reassembly | ✅ naturally |
| `exe llm` caching | ✅ | ✅ |
| Checkpointing | ✅ | ✅ |
| Lines of code (fractals) | ~200 | ~50 |
| Language complexity added | 0 (uses existing `while`) | low (depth counter swap) |

---

## Mutual Recursion

Out of scope for v1 but worth noting: mutual recursion (`@a` calls `@b` calls `@a`) requires the depth counter to track call chains, not just per-name depth. A simple per-name counter doesn't catch mutual recursion cycles. For v1, focus on direct self-recursion only. Mutual recursion can be addressed separately.

---

## Error Messages

| Scenario | Error |
|---|---|
| Depth exceeded | `RecursionDepthExceeded: '@plan' exceeded max call depth (64)` |
| Obvious infinite loop (no base case visible) | Runtime depth exceeded — same error, user adds base case |
| Mutual recursion depth exceeded | `RecursionDepthExceeded: call chain '@a' → '@b' → '@a' exceeded depth (64)` *(v2)* |

---

## Prior Art in the Codebase

`interpreter/eval/exec-invocation.ts` line ~1805 already has a comment:
> "This allows pipelines to retry/re-execute the same function without false circular reference detection"

So there's already at least one case where the same function being called twice is intentionally allowed. The depth counter approach handles this correctly — pipelines that legitimately re-invoke a function just increment and decrement the counter without hitting the limit.

---

## Summary

- **Effort:** Low. One data structure change in `exec-invocation.ts` + `Environment`, one new error type, one new `/set` directive or CLI flag.
- **Impact:** High. Unlocks the natural expression of tree-walk, graph-traversal, and any divide-and-conquer pattern in mlld. The fractals use case is the canonical example but the pattern appears anywhere you're recursively processing hierarchical data with LLMs.
- **The `while` workaround exists** but is semantically incorrect (BFS vs DFS) and requires significant boilerplate. It's a band-aid, not a solution.
