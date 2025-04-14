# Plan: Phase 5B - Stabilize Interfaces, Mocks, and Handlers

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md
- Current AST Structure: docs/dev/AST.md
- High-Level Refactoring Plan: _plans/PLAN-TYPES.md
- Previous Phases: _plans/PLAN-PHASE-3.md, _plans/AST-FIELD.md, _plans/AST-VARIABLES.md
- **Audit Findings:** _cmte/audit/_output/handler-audit/02-synthesize-handler-audit.generate-overall-fix-suggestions.md

This plan details the steps to stabilize core service interfaces, their mocks, and refactor `DirectiveService.ts` and its handlers (`services/pipeline/DirectiveService/handlers/*`) based on the findings from the `cmte` audit. This replaces the original Phase 5B plan with more targeted actions.

**Problem:** Previous refactoring attempts revealed inconsistencies between service interface definitions, handler usage, and test mocks, leading to persistent linter errors and test failures. The `cmte` audit identified specific discrepancies.

**Goal:** Address the discrepancies identified by the audit to stabilize interfaces and mocks, then ensure `DirectiveService` and handlers correctly use the updated types, contexts, and service interfaces.

## Detailed Implementation Plan

**Phase 5B.1: Stabilize Core Interfaces (Based on Audit)**

*   **Objective:** Correct and complete the definitions of core service interfaces based on audit findings.
*   **Actions:**
    1.  **`IValidationService.ts`:**
        *   Add missing `validate(node: DirectiveNode): Promise<void>;` method signature.
    2.  **`IResolutionService.ts`:**
        *   Consolidate duplicate method definitions (e.g., `resolveData`) to use a single, consistent signature with specific types (`JsonValue` instead of `any`).
        *   Add missing method overloads identified by the audit (e.g., `resolveNodes(value: InterpolatableValue, ...)` and `resolveInContext(value: VariableReferenceNode, ...)` if confirmed necessary after reviewing handler usage again). *Initial Action: Focus on consolidation.*
    3.  **`IFileSystemService.ts`:**
        *   Clearly mark `fileExists` as deprecated if keeping, or remove it.
        *   *Decision Point:* Decide whether to update method signatures (like `exists`, `readFile`) to accept `string | ValidatedResourcePath` OR strictly enforce passing `ValidatedResourcePath` (requiring explicit validation before calling). *Initial Action: Keep current signatures (expecting `ValidatedResourcePath`) and ensure mocks align.*

**Phase 5B.2: Update Mock Utilities (Based on Audit)**

*   **Objective:** Align mock factory functions with the updated interface definitions.
*   **Actions:**
    1.  **Locate Mock Factory File:** Confirm the correct path (likely `tests/utils/mocks/serviceMocks.ts` or similar).
    2.  **`createValidationServiceMock`:** Add a default `validate: vi.fn().mockResolvedValue(undefined),` implementation.
    3.  **`createFileSystemServiceMock`:**
        *   Ensure all methods from the *updated* `IFileSystemService.ts` (including `deleteFile`, excluding deprecated/non-existent ones) have default `vi.fn()` mocks.
        *   Ensure mock signatures match the interface (e.g., if interface expects `ValidatedResourcePath`, mock should too, potentially using a simple mock value).
    4.  **`createResolutionServiceMock`:**
        *   Ensure all methods from the *updated* `IResolutionService.ts` (including consolidated signatures and potentially new overloads) have default `vi.fn()` mocks with appropriate return types/implementations.

**Phase 5B.3: Refactor `DirectiveService.ts` Core**

*   **Objective:** Align `DirectiveService` with strict types and remove internal resolution helpers.
*   **Actions:** (Largely done, but verify against updated interfaces/mocks)
    1.  **Standardize Service Interfaces:** Ensure constructor (`@inject`), `initializeFromParams`, `initialize`, and handler instantiation consistently use full service interfaces (from Phase 5B.1).
    2.  **Correct Context Usage:** Ensure `DirectiveProcessingContext` and `ResolutionContext` are created and used correctly.
    3.  **Fix Error Handling:** Ensure `DirectiveError` uses correct codes and details structure.
    4.  **Remove Internal Helpers:** Confirm internal helpers (`resolveText`, `resolveData`, `resolvePath`) were successfully removed and calls now go to `resolutionService`.
    5.  **Fix Handler Instantiation:** Verify correct arguments (using full interfaces) are passed to handler constructors in `registerDefaultHandlers`.
    6.  **Build & Test `DirectiveService.ts`:** Run build and relevant unit tests for the service itself.

**Phase 5B.4: Refactor Directive Handlers (Iterative)**

*   **Objective:** Align individual handlers with the updated interfaces, mocks, context, and remove unused dependencies.
*   **Actions (Repeat for each handler):**
    1.  **Update `execute` Signature:** Ensure signature is `async execute(context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult>`.
    2.  **Use Context:** Access `state`, `resolutionContext`, `executionContext`, `directiveNode` via the `context` parameter.
    3.  **Update Service Calls:** Ensure calls to injected services (`this.resolutionService`, `this.fileSystemService`, etc.) use methods compatible with the *updated* interfaces (Phase 5B.1).
    4.  **Remove Unused Injections:** Remove service injections identified as unused by the audit (e.g., `IValidationService` in several handlers).
    5.  **Standardize Error Handling:** Use `DirectiveError` with consistent details object (`{ node, context: { currentFilePath }, cause }`).
    6.  **Remove Metadata Args:** Ensure calls to `state.setXVar` do not include the third metadata argument.
    7.  **State Cloning:** Remove internal `state.clone()` calls; handlers should operate on and return the state provided in the context (InterpreterService manages cloning). *Self-correction: Handlers returning `DirectiveResult` should still return the state they operated on, even if it's the same instance passed in.*
    8.  **Refactor Handler Unit Tests:**
        *   Update test setup to use `TestContextDI` and the *updated* mock factories (Phase 5B.2).
        *   Create and pass the full `DirectiveProcessingContext`.
        *   Update assertions to match the refactored logic, mocks, and return types (`IStateService` or `DirectiveResult`). Remove `setXVar` metadata checks. Ensure `expectToThrowWithConfig` is used correctly. Fix any persistent linter errors now that interfaces/mocks are stable.

**Phase 5B.5: Integration & Finalization**

*   **Objective:** Ensure end-to-end stability after handler refactoring.
*   **Actions:**
    1.  **Re-enable Handler Registration:** Uncomment `this.registerHandler(...)` calls in `DirectiveService.registerDefaultHandlers`.
    2.  **Run Full Service Tests:** Run `npm test services`.
    3.  **Address Remaining Runtime Failures:** Systematically debug and fix the ~10 failures identified previously in `DirectiveService.integration.test.ts`, `ResolutionService.test.ts`, `PathService.test.ts`, `InterpreterService.unit.test.ts`.
    4.  **Final Lint & Review:** Run linter and perform code review.
    5.  **Update Documentation:** Update relevant docs (`DI-ARCHITECTURE.md`, `TESTS.md`) if needed.
