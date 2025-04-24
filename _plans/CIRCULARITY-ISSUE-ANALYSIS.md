# Circular Import OOM Issue Analysis

**Date:** 2025-04-24

## Root Cause

- Tests invoke `processMeld` without supplying a `filePath`, so import resolution runs in an “unknown” context.
- Each recursive import creates a fresh DI child container, leading to a new `CircularityService` instance per import.
- Because the import stack is never shared or populated, circular references (A → B → A) never trigger detection and never halt, resulting in uncontrolled recursion and OOM.

## Proposed Solution

1. **Pass `filePath` into `processMeld`** so that imported directives can record and compare paths in state.
2. **Share a single `CircularityService` instance** across nested imports by using the same DI container for all invocations.
3. **Update import tests** to include the `filePath` option on `processMeld` and reuse the same `container` to ensure circular‐import detection fires properly.

## Next Steps

- Modify integration tests to pass `filePath: mainFilePath` into `processMeld`.
- Refactor `processMeld` signature and invocation to forward the `filePath` to the interpreter/context.
- Verify that circular imports now throw a clear error instead of recursing.
