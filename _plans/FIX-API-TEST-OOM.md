# Plan: Resolve API Integration Test Failures (DI & Transformation Output)

**RECENT CONTEXT (Update):**
*   **Goal:** Fix remaining assertion failures in `api/api.test.ts` related to `@run` output in transformation mode.
*   **Investigation Summary:**
    *   ✅ **DI Fixed & Verified:** Added missing DI registrations to `api/api.test.ts`, fixing initial resolution errors.
    *   ⚠️ **Problem Persists:** The two assertion failures in `api.test.ts` related to missing `@run` output (`expect('').toContain('Hello')` etc.) still fail.
    *   **Debugging Transformation Output:**
        *   `RunDirectiveHandler` correctly produces a replacement `TextNode`.
        *   `InterpreterService` correctly calls `state.transformNode`.
        *   `StateService.transformNode` & `updateState` correctly update the internal `transformedNodes` array.
        *   `StateService.clone` & `StateFactory.createClonedState` correctly copy the `transformedNodes` array reference.
        *   Logs *inside* `StateService.getTransformedNodes` (even on the final cloned state) show it *intends* to return the correct transformed list (`[Text, Directive, Text]`).
        *   **Contradiction:** Logs *immediately after* the `getTransformedNodes` call in `api/index.ts` show the caller receives the *original* node list (`[Text, Directive, Directive]`). Array cloning methods (`slice`, spread operator) were tested and made no difference.
*   **Root Cause Hypothesis:** The application logic (state updates, cloning, parameter passing) appears sound based on extensive logging. The discrepancy between the value `getTransformedNodes` intends to return and the value received by the caller points to a deeper issue potentially outside the direct application code:
    1.  **Environment/Tooling:** Node.js, TypeScript (`tsup`), or test runner (`vitest`) interaction causing unexpected behavior with array references or clones.
    2.  **Obscure Bug:** Memory corruption, reference issue, or async timing problem not revealed by logging.
    3.  **Logging Artefact:** (Less likely) `process.stdout.write` timing issue.
*   **Immediate Next Step:** Use the Node.js debugger to step through the `getTransformedNodes` return statement and the subsequent assignment in `api/index.ts` to directly inspect the array reference and value in memory.

---

## 1. Goal

Resolve the persistent "JavaScript heap out of memory" (OOM) errors previously occurring during API-level integration tests (`api/*.test.ts`), address subsequent DI and runtime errors uncovered during the fix, and establish a stable testing strategy that uses real services via the `processMeld` API entry point. **Ensure transformed output (especially from `@run`) is correctly generated.**

## 2. Problem Context & Investigation Summary

- **Initial State:** Major refactors (AST, State, Types) led to OOM errors in API tests.
- **Attempted Fixes & Findings:**
    - OOM linked to test containers + `processMeld` interaction.
    - Fixed initial DI (`DependencyContainer`, `MainLogger`) and circular DI (`delay()`) issues.
    - Refactored `DirectiveService` and handlers for proper DI (Steps 1-4 below).
    - **Step 1-4 (Core DI Refactor): COMPLETE.**
    - **Step 5 (Validation): COMPLETE.** `DirectiveService.test.ts` and `api/smoke.test.ts` passing.
    - **Step 6 (Integration Refactor - Diagnosis):**
        *   Applied minimal DI to `api/api.test.ts`.
        *   Encountered misleading "Run directive command cannot be empty" errors (FIXED).
        *   Identified incorrect DI setup in `api/api.test.ts` as the cause for `getAllVariables is not a function` errors during resolution (FIXED by adding full DI registrations).
        *   **Current Status:** DI errors are fixed, but the original two assertion failures persist in `api/api.test.ts`'s "Full Pipeline Integration" tests. Extensive logging narrowed the problem down to the value returned by `StateService.getTransformedNodes` being incorrect at the call site (`api/index.ts`), despite internal logs showing the correct data *before* the `return` statement.

## 3. Root Cause Hypothesis (Revised Further)

- OOM/Initial DI/Circular DI errors resolved.
- State/Map key/Validation/Error wrapping issues fixed.
- DI configuration in `api/api.test.ts` corrected.
- State update/cloning logic appears correct based on detailed logging.
- **Current Problem:** An unknown mechanism (potentially environment-related, an obscure JS reference bug, or a test runner/async interaction issue) is causing `StateService.getTransformedNodes` to effectively return the *original* node list instead of the *transformed* list at the `api/index.ts` call site, despite internal logs showing the correct transformed list is available right before the return.

## 4. Revised Strategy

Use the Node.js debugger to bypass logging limitations and directly inspect the state of variables and object references in memory during the execution of `getTransformedNodes` and the calling code in `api/index.ts` to identify the exact point of failure.

## 5. Next Steps (Revised - Start Here)

1.  **(PRIORITY)** **Debug `getTransformedNodes` Return Value:**
    *   Configure and run the failing `api/api.test.ts` test (`should handle the complete parse...`) using the Node.js debugger (e.g., via VS Code debugger launch configuration or `node --inspect-brk`).
    *   Set breakpoints:
        *   Inside `StateService.getTransformedNodes`, right before the `if (transformEnabled && transformedNodesExist)` check.
        *   Inside `StateService.getTransformedNodes`, on the `return` statement within the `if` block (`return transformedNodesArray!.slice();`).
        *   In `api/index.ts`, on the line `const nodesToProcess = finalStateCloneForOutput.getTransformedNodes();` (immediately after the call returns).
    *   **Step through the execution:**
        *   When paused *before* the `if`, inspect `this.currentState.nodes` and `this.currentState.transformedNodes` in the debugger's variable inspector. Verify `transformedNodes` contains the expected `TextNode` at index 2.
        *   When paused *on* the `return` statement, verify again that `transformedNodesArray` holds the correct array reference containing the `TextNode`.
        *   When paused *after* the call in `api/index.ts`, inspect the `nodesToProcess` variable. Does it contain the transformed list (with the `TextNode`) or the original list (with the `Directive`)?
2.  **(Diagnosis based on Debugger):** Analyze the values observed in the debugger to pinpoint where the array content or reference changes unexpectedly.
3.  **(Fix)** Implement the necessary fix based on the debugger findings.
4.  **Re-validate `api/api.test.ts`:** Run `npm test api/api.test.ts`. Verify the two assertion failures are fixed.
5.  **Continue Integration Test Refactor:** Address remaining test failures and refactor other tests as previously planned.
6.  **Final Validation:** Run `npm test api cli`.
7.  **Cleanup:** Remove all debug logs (`process.stdout.write` and `logger.debug`). 