# Current Test Failures (Post-ResolutionService Fixes)

This plan tracks the remaining test failures after addressing the bulk of issues in `ResolutionService.test.ts`.

## Remaining Failures & Issues:

1.  **[PARTIALLY RESOLVED - GH#24 REMAINS] `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts` & `*.edge.test.ts`:**
    *   **Original Errors:**
        *   ~~`TypeError: Cannot read properties of undefined (reading 'PROPERTY')`~~ (RESOLVED)
        *   `expected 'TypeError'/'MeldResolutionError' to be 'FieldAccessError'` (Known/Deferred Issue GH#24).
    *   **Reason:** Initial `TypeError` was due to incorrect type imports/usage in tests. Remaining failures relate to the known deferred error type propagation problem (GH#24).
    *   **Original Plan Indices:** #3, plus new issues & GH#24.

2.  **`services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.integration.test.ts` Context/SourceMap Failure:**
    *   **Error:** `should handle validation errors with proper context`: `expected undefined to be defined` (checking `error.context`).
    *   **Reason:** Failure in context/source location propagation, likely related to Phase 1/2 changes.
    *   **Original Plan Index:** #4 (#24).

3.  **`services/pipeline/DirectiveService/DirectiveService.test.ts` Interpolation Failures:**
    *   **Errors:**
        *   `should process text directive with variable interpolation`: `expected 'Hello {{name}}' to be 'Hello World'`.
        *   `should process data directive with variable interpolation`: `Directive error (data): Error processing data directive: object is not iterable...`.
    *   **Reason:** 
        *   Text interpolation: The `TextDirectiveHandler` is not resolving variables (e.g., `{{name}}`) within the directive's content before setting the state variable. It needs to call the resolution service.
        *   Data interpolation: The `DataDirectiveHandler` likely has a bug related to handling non-iterable values during processing or interpolation.
    *   **Original Plan Index:** #5 / #9 (Text), plus data handling issue.

4.  **[RESOLVED] `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts` Mock Execution Failures:**
    *   **Original Errors:** `executeCommand` mock (`fileSystemService.executeCommand`) not called as expected in tests for substituting required/all args.
    *   **Reason:** Parameter substitution logic was commented out, causing tests to fail before reaching the execution call. Uncommenting the logic resolved the issue.
    *   **Original Plan Index:** Related to #3 (Mocking Failures) but specific to `CommandResolver`.

5.  **`services/pipeline/OutputService/OutputService.test.ts` Field Access Failure:**
    *   **Error:** `should handle field access with direct field access fallback`: `expected 'User: {{user.name}}...' to contain 'User: Claude'`.
    *   **Reason:** Resolution/field access logic isn't producing the expected output within the `OutputService` context.
    *   **Original Plan Index:** #3 (Expected/Fix Later).

6.  **`services/pipeline/InterpreterService/InterpreterService.integration.test.ts` Skipped Tests:**
    *   **Status:** The entire suite (24 tests) is currently skipped.
    *   **Reason:** These tests likely fail due to reliance on older service interfaces/behaviors and need updating or unskipping after other issues are resolved.
    *   **Original Plan Index:** #8 (Expected/Fix Later).

## Deferred / Known Issues (Tracked on GitHub):

*   **GH#24:** Incorrect `FieldAccessError` type reported in `ResolutionService` tests.
*   **GH#25:** Deferred linter errors suppressed with `@ts-ignore`.
*   **GH#26:** Incomplete `detectCircularReferences` implementation.
*   **GH#27:** Inconsistent DI usage across various test files.

**Recommendation:**

Focus on fixing the failures in `VariableReferenceResolver` (Item #1, excluding GH#24) and `CommandResolver` (Item #4) first, as these are core components of the resolution process. Then address the `DirectiveService` (Item #3) and `OutputService` (Item #5) issues. Finally, tackle the context propagation issue (Item #2) and unskip/update the `InterpreterService` integration tests (Item #6).
