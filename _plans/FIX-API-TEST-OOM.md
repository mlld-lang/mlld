# Plan: Resolve API Integration Test Failures (DI Focus)

**HANDOFF CONTEXT:**
*   **Goal:** Fix remaining assertion failures in `api/api.test.ts` related to variable resolution (e.g., `{{greeting}}` not resolving).
*   **Root Cause:** Investigation traced the issue to incorrect Dependency Injection (DI) setup within `api/api.test.ts`. The test-specific child container (`testContainer`) is missing registrations for core services like `IStateService`, causing resolution failures downstream.
*   **Immediate Next Step:** Edit `api/api.test.ts` to add the necessary DI registrations to `testContainer` in the `beforeEach` block.

---

## 1. Goal

Resolve the persistent "JavaScript heap out of memory" (OOM) errors previously occurring during API-level integration tests (`api/*.test.ts`), address subsequent DI and runtime errors uncovered during the fix, and establish a stable testing strategy that uses real services via the `processMeld` API entry point.

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
        *   Encountered misleading "Run directive command cannot be empty" errors.
        *   **Debugging `@run`:** Used extensive logging (`process.stdout.write`).
            *   Fixed state propagation/map key issues.
            *   Identified premature validation in `RunDirectiveValidator.ts` as the cause of the misleading error (FIXED).
            *   Identified error wrapping in `InterpreterService` obscuring the source (FIXED).
        *   **Current Status:** After fixing validation/wrapping, the "command empty" errors are gone, but 2 new assertion failures related to variable resolution appeared in `api/api.test.ts`.

## 3. Root Cause Hypothesis (Confirmed)

- OOM/Initial DI/Circular DI errors resolved.
- State/Map key/Validation/Error wrapping issues fixed.
- **Current Problem:** The remaining variable resolution failures (`greeting`, `name` not found by `VariableReferenceResolver` in `api/api.test.ts`) are caused by **incorrect DI setup in `api/api.test.ts`**. The child container (`testContainer`) used for the tests is missing registrations for core services (`IStateService`, `IResolutionService`, etc.). This causes `VariableReferenceResolver` to receive the wrong state instance during resolution lookups initiated within the `processMeld` call (confirmed by `currentState.getAllVariables is not a function` error during logging).

## 4. Revised Strategy

Fix the root cause of the variable resolution failures by ensuring the test-specific DI container in `api/api.test.ts` is correctly configured with all necessary service implementations. Once `api.test.ts` passes, continue the broader integration test refactoring.

## 5. Next Steps (Handoff - Start Here)

1.  **(PRIORITY)** **Fix DI in `api/api.test.ts`:** 
    *   Edit `api/api.test.ts`.
    *   In the `beforeEach` block, add registrations to the `testContainer` for **all core services and their interfaces** required by `processMeld` and its dependencies.
    *   This includes (but may not be limited to): `IStateService`, `IResolutionService`, `IPathService`, `IFileSystemService`, `IDirectiveService`, `IInterpreterService`, `IOutputService`, `IValidationService`, `ICircularityService`, necessary client factories (`FileSystemServiceClientFactory`, `PathServiceClientFactory`, `InterpreterServiceClientFactory`, `DirectiveServiceClientFactory`, `ParserServiceClientFactory`), and all default `IDirectiveHandler` implementations.
    *   Ensure these registrations use the **actual service implementations** (e.g., `testContainer.register('IStateService', { useClass: StateService })`) mirroring the setup in `core/di-config.ts`.
2.  **Re-validate `api/api.test.ts`:** Run `npm test api/api.test.ts`. Verify that the two assertion failures related to variable resolution (`expect('').toContain('Hello')` and `expect(', !').toContain('Hello, World!')`) are now fixed.
3.  **Continue Integration Test Refactor:** Once `api/api.test.ts` passes reliably:
    *   Apply the minimal DI pattern (register `IFileSystem` + Logger mock in child container, pass container to `processMeld`) to `api/integration.test.ts` and `api/resolution-debug.test.ts`. Fix any resulting test failures.
    *   Fix the build error in `api/array-access.test.ts` (manual syntax correction).
    *   Refactor `cli/cli.test.ts` if necessary, ensuring it uses the correctly configured API layer.
4.  **Final Validation:** Run `npm test api cli` to ensure all integration tests pass.
5.  **Cleanup:** Remove all `process.stdout.write` debug logs added during this investigation (`RunDirectiveHandler.ts`, `DirectiveService.ts`, `VariableReferenceResolver.ts`, etc.). 