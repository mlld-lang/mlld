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

3.  **[DEFERRED - Requires Test Refactor] `services/pipeline/DirectiveService/DirectiveService.test.ts` Interpolation Failures:**
    *   **Original Errors:**
        *   `should process text directive with variable interpolation`: `expected 'Hello {{name}}' to be 'Hello World'`.
        *   `should process data directive with variable interpolation`: `Directive error (data): Error processing data directive: object is not iterable...` (later changed to `expected { greeting: 'Hello [object Object]' } to deeply equal { greeting: 'Hello Alice' }`).
    *   **Debugging Journey & Diagnosis:**
        *   Initial hypothesis was that `TextDirectiveHandler` wasn't resolving variables. Simplified handler logic, but text failure persisted.
        *   Initial data interpolation failure ("not iterable") was traced to incorrect `ResolutionContext` creation (using object instead of array for `allowedVariableTypes`). Fixed by using `ResolutionContextFactory`.
        *   Data interpolation failure then changed to `Hello [object Object]` vs `Hello Alice`, pointing to incorrect stringification in `VariableReferenceResolver.resolve`.
        *   Corrected `VariableReferenceResolver.resolve` to return the `.value` of `TextVariable` instead of using `String()`. Text interpolation failure *still* persisted (`Hello {{name}}`) and data interpolation failure reverted (`Hello [object Object]`).
        *   Further investigation revealed the `DirectiveService.test.ts` suite uses an outdated `TestContext` setup, likely lacks mocks for `IResolutionService`, and implicitly uses the *real* `ResolutionService`. This means the fixes to `ResolutionService` and its resolvers might be correct, but the test environment itself is flawed, causing inconsistent behavior and masking the true state. The handlers likely receive an improperly configured or non-functional `ResolutionService` instance in this test.
    *   **Status:** Deferred pending refactor of `DirectiveService.test.ts` to use `TestContextDI`.
    *   **Original Plan Index:** #5 / #9, plus data handling issue.

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
*   **GH#TBD:** `DirectiveService.test.ts` needs refactoring to use `TestContextDI`.

**Recommendation:**

Focus on the remaining non-deferred, non-test-setup failures: `OutputService` (Item #5) and the context propagation issue (Item #2). Then address the skipped `InterpreterService` tests (Item #6). The `DirectiveService` test refactor (Item #3 / GH#TBD) should be tackled as a separate effort.
