# Plan: Phase 5B - Directive Service & Handlers Refactor

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md
- Current AST Structure: docs/dev/AST.md
- High-Level Refactoring Plan: _plans/PLAN-TYPES.md
- Previous Type Cleanup: _plans/PLAN-PHASE-3.md, _plans/AST-FIELD.md, _plans/AST-VARIABLES.md

This plan details the steps to refactor `DirectiveService.ts` and its associated handlers (`services/pipeline/DirectiveService/handlers/*`) to align with the strictly typed service interfaces (`IResolutionService`, `IPathService`, `IStateService`, etc.) and the standardized `DirectiveProcessingContext` introduced in earlier refactoring phases.

**Problem:** The current `DirectiveService` and its handlers are causing build errors due to:
- Mismatched service interface types (`Like` vs full interfaces).
- Missing type imports.
- Incorrect directive handler `execute` signatures.
- Incorrect usage of context objects.
- Incorrect error code/details usage.
- General type mismatches.

**Goal:** Align `DirectiveService` and all `IDirectiveHandler` implementations with the strictly typed service interfaces and the standardized `DirectiveProcessingContext`.

## Detailed Implementation Plan

**Phase 5B.1: Refactor `DirectiveService.ts` Core**

1.  **Standardize Service Interfaces:**
    *   **Action:** Modify the constructor (`@inject`), internal methods (`initializeFromParams`, `initialize`), and handler instantiation in `registerDefaultHandlers` to consistently use the *full* service interfaces (e.g., `IValidationService`, `IPathService`, `IFileSystemService`, `IResolutionService`) where possible. Use `Like` types only if necessary for DI resolution.
    *   **Add Missing Imports:** Add imports for `IValidationService`, `IFileSystemService`, `ResolutionContext`, `IVariableReference`, `MeldPath`.
    *   **Update Interface:** Modify `IDirectiveService.ts`\'s `initialize` signature to expect the full interfaces if the implementation uses them consistently.
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`, `services/pipeline/DirectiveService/IDirectiveService.ts`

2.  **Correct Context Usage:**
    *   **Action:** Replace accesses like `context.currentFilePath` with `context.state.getCurrentFilePath()`. Ensure `ResolutionContextFactory.create` is called with the correct arguments (`state as IStateService`, `currentFilePath`).
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`

3.  **Fix Error Handling:**
    *   **Action:** Use valid `DirectiveErrorCode` members (e.g., `DirectiveErrorCode.INTERNAL_ERROR`, `DirectiveErrorCode.EXECUTION_FAILED`). Remove the incorrect `severity` property from the `details` object passed to the `DirectiveError` constructor.
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`

4.  **Refactor/Remove Internal Helpers:**
    *   **Action:** Review internal helper methods (`resolveData`, `resolvePath`). Update their signatures to accept correct types (`IVariableReference`, `MeldPath`). **Strongly consider removing these helpers** and calling `resolutionService` methods directly, passing the correct AST nodes/types.
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`

5.  **Fix Handler Instantiation:**
    *   **Action:** Ensure correct number and type of arguments (using full service interfaces) are passed to each handler\'s constructor in `registerDefaultHandlers`. Add checks for service availability before instantiation.
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`

6.  **Temporarily Isolate `DirectiveService.ts`:**
    *   **Action:** Comment out all `this.registerHandler(...)` calls within `registerDefaultHandlers`.
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`

7.  **Build & Test `DirectiveService.ts`:**
    *   **Action:** Run `npm run build` and fix any remaining errors *specifically within `DirectiveService.ts`* (ignoring handler/CLI errors).

**Phase 5B.2: Refactor Directive Handlers (Iterative)**

8.  **Refactor Individual Directive Handlers:**
    *   **Action:** For *each* handler file (`TextDirectiveHandler.ts`, `DataDirectiveHandler.ts`, etc.):
        *   Update the `execute` method signature to: `async execute(context: DirectiveProcessingContext): Promise<DirectiveResult | IStateService>`.\
        *   Update the handler\'s internal logic:\
            *   Access directive node via `context.directiveNode`.\
            *   Access state via `context.state`.\
            *   Access resolution context via `context.resolutionContext`.\
            *   Call other services (e.g., `this.resolutionService`, `this.pathService`) using methods defined in their *full interfaces* (`IResolutionService`, `IPathService`), passing required strict types (AST nodes, `MeldPath`, `ResolutionContext`).\
        *   Ensure the method returns either an `IStateService` instance or a `DirectiveResult` object (`{ state: IStateService, replacement?: MeldNode }`).\
        *   Ensure constructor injections use full interfaces where needed.\
    *   **Files:** All files in `services/pipeline/DirectiveService/handlers/`.

**Phase 5B.3: Integration & Finalization**

9.  **Re-enable Handler Registration:**
    *   **Action:** Uncomment the `this.registerHandler(...)` calls in `registerDefaultHandlers` within `DirectiveService.ts`.\
    *   **Files:** `services/pipeline/DirectiveService/DirectiveService.ts`

10. **Final Build & Test:**
    *   **Action:** Run `npm run build`. Fix any remaining integration errors between the service and handlers.\
    *   **Action:** Run relevant tests (`npm test services/pipeline/DirectiveService/...`, potentially broader integration tests) and fix failures.
