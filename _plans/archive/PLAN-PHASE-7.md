## Phase 7: App Service & E2E Integration

*   **Goal:** Integrate all strictly typed components (`IStateService`, refactored `ParserService` with rich AST, `DirectiveService` with `DirectiveResult`, `InterpreterService`, `SerializationService`) into the main `AppService` and ensure the end-to-end processing pipeline functions correctly.
*   **Status:** `NOT STARTED`
*   **Assumptions:**
    *   Phases 1-6 are complete.
    *   All individual services (`StateService`, `ParserService`, `DirectiveService`, `InterpreterService`, `SerializationService`) adhere to their defined typed interfaces and handle the new AST structures.
*   **Key Files:**
    *   `src/app/app.service.ts`
    *   Relevant e2e test files (e.g., `*.e2e-spec.ts`)
*   **Tasks:**
    *   **`AppService` Integration:**
        *   **Action:** Modify `AppService` (or equivalent orchestrator) to use the typed services.
        *   **Requirement:** Ensure the data flow is correct: `AppService` takes input, calls `ParserService` (gets rich `MeldNode[]`), passes it to `InterpreterService` (which uses `DirectiveService` and `StateService`), and finally calls `SerializationService` with the resulting AST and State.
        *   **Requirement:** Verify that type signatures match correctly throughout the `AppService`'s orchestration logic.
    *   **End-to-End Testing:**
        *   **Action:** Update or create E2E tests that cover common use cases and edge cases involving the new directive syntax and interpolation.
        *   **Requirement:** Tests should validate the final serialized output against expected results based on the processing through the entire typed pipeline.
        *   **Requirement:** Pay special attention to tests involving nested directives, complex interpolations, and state modifications handled via `IStateService`.
*   **Testing:** Update/create E2E tests, manual testing of representative `.mld` files through the full application. 