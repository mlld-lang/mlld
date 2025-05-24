# Circular Import Handling Investigation

## Problem

Integration tests involving circular imports (e.g., `a.md` imports `b.md`, and `b.md` imports `a.md`) resulted in `Maximum call stack size exceeded` errors or hangs, indicating uncontrolled recursion.

## Initial Hypothesis & Actions

The initial assumption was that the `CircularityService` was either failing to detect the cycle or that the `MeldImportError` it's designed to throw upon detection was not being handled correctly, failing to halt the interpretation process.

**Actions Taken:**

1.  **Error Handling:** Ensured `CircularityService.beginImport` throws `MeldImportError` correctly.
2.  **Stack Management:** Added `try...finally` in `ImportDirectiveHandler.handle` to guarantee `CircularityService.endImport` is called. Refactored `endImport` to use `pop()` for cleaner stack logic.
3.  **Interpretation Halt:** Added a specific `try...catch` block in the main loop of `InterpreterService.interpret` to catch `MeldImportError` and explicitly stop interpretation by re-throwing it.
4.  **Error Propagation:** Ensured `ImportDirectiveHandler.handle` re-throws `MeldImportError` if caught during the interpretation of imported content.
5.  **Logging:** Added distinct `logger.error` messages:
    *   In `CircularityService.beginImport` right before throwing `MeldImportError` (`!!! CIRCULARITY DETECTED...`).
    *   In the `InterpreterService.interpret` catch block (`!!! INTERPRETER LOOP: Caught MeldImportError...`).

## Key Observation

Despite these changes, the tests *still* failed with stack overflows. Crucially, **neither of the added log messages appeared in the test output.**

This indicated that the stack overflow was occurring *before* the `CircularityService` had a chance to detect the repeat import across nested calls, and therefore the `MeldImportError` was never being thrown or caught in this scenario.

## Root Cause Analysis

Tracing the call stack and context propagation revealed the following:

1.  `InterpreterService.interpret` creates or obtains a `CircularityService` instance to track the current interpretation run.
2.  This instance is correctly passed down the call stack (`interpretNode` -> `callDirectiveHandleDirective` -> `DirectiveService.handleDirective`) within the `DirectiveProcessingContext` object (`context.circularityService`).
3.  `DirectiveService.handleDirective` passes this `context` object to the appropriate handler, in this case, `ImportDirectiveHandler.handle`.
4.  **The Issue:** The previous analysis incorrectly identified `ImportDirectiveHandler` as the source of the problem. It was correctly modified to use `context.circularityService`. However, the tests (`should handle mutually recursive imports`, `should detect circular imports`) started failing with `DirectiveError: CircularityService not provided in context`.
5.  **Refined Understanding:** The `InterpreterService.interpret` method has logic to use a provided `circularityService` parameter *or* fall back to resolving one from the dependency injection container (`this.container.resolve<ICircularityService>('ICircularityService')`) if the parameter is `undefined`. The error indicates this fallback resolution is returning `undefined` in the failing tests, likely due to `ICircularityService` not being properly registered in the test container.
6.  **Consequence:** An `undefined` `circularityService` is passed down the chain, eventually causing the `ImportDirectiveHandler` to throw the `CircularityService not provided in context` error.

## Chosen Solution

Instead of fixing the DI registration in tests (which might mask underlying issues or add complexity), modify `InterpreterService.interpret` to create a **new, local `CircularityService` instance** if one is not explicitly passed in via the parameter. This aligns with the idea that circularity detection is specific to a single interpretation run.

## Proposed Fix

Modify `InterpreterService.interpret` to create a new `CircularityService` instance if one is not provided.

## Outstanding Issues

*   The smoke test `API Smoke Tests > should process a simple text variable substitution` is failing (`AssertionError: expected '' to be 'Hello World!'`). This seems unrelated to circular imports and likely stems from previous refactoring of variable handling logic within `ImportDirectiveHandler`.
