---
updated: 2026-02-19
tags: #hooks, #checkpoint, #resume, #adr
related-docs: docs/dev/HOOKS.md, docs/dev/ARCHITECTURE.md, spec-hooks-checkpoints-resume.md, plan-hooks-checkpoints-resume.md
related-code: interpreter/hooks/HookManager.ts, interpreter/hooks/hook-decision-handler.ts, interpreter/env/ContextManager.ts
---

# Hooks + Checkpoint + Resume Contract (Phase 0)

This note freezes two protocol choices before runtime rollout work begins.
Phase 0 is documentation-only. Runtime behavior does not change in this phase.

## Decision 1: Pre-hook checkpoint short-circuit protocol

### Decision table

| Option | Description | Blast radius | Rollback strategy |
|---|---|---|---|
| A: metadata-only short-circuit | Keep `HookDecisionAction` unchanged and encode cache-hit result in decision metadata consumed by specific call sites | Every call site must inspect metadata and branch locally; guard/checkpoint coupling is spread across directive, exec, and effect paths | Remove metadata checks at each call site; no central switch |
| B: explicit `fulfill` action + compatibility adapter | Add a dedicated decision action for "already have result", with a Phase 6A adapter that maps legacy metadata until call sites migrate | Decision protocol changes in hook manager/handler, then call sites adopt action in one follow-up phase | Disable call-site handling of `fulfill`, keep adapter in place, and continue miss-only execution |

### Selected option

Selected: **Option B (`fulfill` action + compatibility adapter)**.

Rationale:
- Makes cache-hit semantics explicit in the decision protocol.
- Keeps short-circuit behavior centralized instead of metadata parsing in multiple hot paths.
- Supports safe rollout: Phase 6A can land adapter-only wiring with no behavior changes, then Phase 6B can activate short-circuit handling.

### Rollout guardrail

- Phase 6A: introduce adapter and register checkpoint hooks in inert mode.
- Phase 6B: activate execution short-circuit in directive/exec/effect boundaries.

## Decision 2: Canonical hook operation filter keys

The canonical operation keys for hook filters are locked as:

- `for`
- `for:iteration`
- `for:batch`
- `loop`
- `import`

Rationale:
- Keys match operation-boundary intent, not implementation detail names.
- `for:iteration` and `for:batch` separate per-item and batch-boundary hooks.
- Canonical keys avoid later churn in grammar, HookRegistry lookup, and user docs.

## Compatibility notes

- Existing guard lifecycle and non-reentrancy behavior remains source-of-truth until Phase 3.
- No backward-incompatible user syntax is introduced in this phase.
- This contract is the decision baseline for Phases 1-9 in `plan-hooks-checkpoints-resume.md`.
