---
updated: 2026-02-19
tags: #hooks, #checkpoint, #resume, #risk-gate
related-docs: docs/dev/HOOKS-CHECKPOINT-RESUME-CONTRACT.md, docs/dev/HOOKS.md, docs/dev/ARCHITECTURE.md, docs/user/security.md
related-code: interpreter/hooks/HookManager.ts, interpreter/hooks/hook-decision-handler.ts, interpreter/env/ContextManager.ts, interpreter/eval/for.ts, interpreter/utils/parallel.ts
---

# Hooks + Checkpoint Pre-3A Risk Gates (Phase 0.5)

This note locks high-risk semantics before lifecycle insertion and checkpoint rollout.
It is a prefeature gate: the goal is to reduce ambiguity before behavior changes land.

## 1) Short-circuit Protocol + Adapter Contract

- Baseline contract remains: `fulfill` is the target short-circuit action (from Phase 0).
- Rollout contract:
  - Phase 6A ships a compatibility adapter only.
  - Phase 6B activates short-circuit behavior at directive/exec/effect boundaries.
- Safety rule: call sites must not require metadata shape coupling for cache-hit branching once adapter wiring is complete.

## 2) Suppression Matrix (Normal vs Hook vs Guard)

| Execution context | User hooks | Guard hooks | Notes |
|---|---|---|---|
| Normal operation | Enabled | Enabled | Default runtime behavior |
| Nested operation inside user hook body | Suppressed | Enabled | Prevent hook recursion, keep policy enforcement |
| Nested operation inside guard evaluation | Suppressed | Suppressed | Existing guard non-reentrancy behavior remains authoritative |

This matrix is intentionally strict: user hooks must never recurse through their own side-effect paths, while guard safety checks remain active for hook-triggered nested operations.

## 3) `op:for:batch` Boundary Semantics

`op:for:batch` is a batch-boundary operation key, not a per-item key.

- Batch index is zero-based.
- Batch size is actual item count in the current window (last window may be partial).
- Boundary lifecycle expectation:
  - `before op:for:batch` fires at batch start with window metadata.
  - `after op:for:batch` fires once the batch window finishes.
- Per-item semantics remain in `op:for:iteration`.

## 4) Resume Target Resolution Precedence

When multiple resume selectors can match, resolve in this order:

1. `@fn:index` (explicit invocation-site index)
2. `@fn` (exact function name target)
3. `@fn("prefix")` (fuzzy/prefix selector)

Tie-breaking rule: if a selector is ambiguous after applying precedence, fail with an explicit targeting error instead of picking an arbitrary match.

## 5) External Service Integration Scope in Hook Bodies

No new "external call" feature is introduced for hooks.

- Hook bodies use existing language features only:
  - `/output`
  - `/run`
  - `/append`
  - `state://`
  - existing executable calls (including MCP-backed executables)
- Error isolation requirement:
  - failures in hook side effects are recorded in hook error context,
  - parent operation execution continues.

## 6) Checkpoint Manifest Versioning + Atomic Persistence

Persistence compatibility contract:

- Manifest includes explicit `version`.
- Unknown fields are tolerated and preserved as forward-compatible metadata.
- Unknown manifest versions degrade to cold-cache behavior (no destructive clear).
- Cache/manifests use atomic temp-file + rename writes.
- Failed writes must not clobber the previously committed manifest/result files.

## 7) Guard/Cache Drift Handling Strategy

Cache hits remain a memoization decision unless explicitly invalidated.

- Guard/policy changes do not automatically invalidate existing checkpoint entries.
- Operational guidance: use `--fresh` when policy/guard behavior is expected to alter safety decisions for cached paths.
- Future direction: optional guard/policy fingerprinting in manifest metadata for targeted invalidation tooling.

## 8) Test + Fixture Gate Artifacts

Phase 0.5 adds early diagnostics and scaffolds:

- Lifecycle trace helper:
  - `tests/helpers/hook-lifecycle-trace.ts`
  - `tests/interpreter/hooks/lifecycle-trace-helper.test.ts`
- Checkpoint manifest compatibility scaffolds:
  - `tests/interpreter/checkpoint/manifest-schema-version.test.ts`
- Atomic write failure/recovery scaffolds:
  - `tests/interpreter/checkpoint/atomic-write-scaffold.test.ts`
- Golden integration fixture scaffolds:
  - `tests/cases/integration/checkpoint/hooks-ordering-visibility/`
  - `tests/cases/integration/checkpoint/miss-hit-semantics/`
  - `tests/cases/integration/checkpoint/resume-fuzzy-targeting/`
  - `tests/cases/integration/checkpoint/fork-hit-miss-overlay/`
