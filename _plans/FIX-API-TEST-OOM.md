# Plan: Resolve OOM Errors and Integration Test Failures

## 1. Goal

Resolve the persistent "JavaScript heap out of memory" (OOM) errors previously occurring during API-level integration tests (`api/*.test.ts`), address subsequent DI and runtime errors uncovered during the fix, and establish a stable testing strategy that uses real services via the `processMeld` API entry point.

## 2. Problem Context & Investigation Summary

- **Initial State:** After major refactors (AST, State, Types, Handlers - see `PLAN-TYPES.md`, `AST-VARIABLES.md`, `STATE-UPDATES.md`, `REFAC-DirectiveHandler-StateChanges.md`), attempts to refactor API tests using manual child containers (`REFAC-SERVICE-TEST-DI.md`) consistently resulted in OOM errors, not simple DI resolution failures.
- **Attempted Fixes & Findings:**
    - OOM was linked to interaction between test-managed containers and `processMeld`.
    - Fixing `processMeld` DI registration (`DependencyContainer`, `MainLogger`) resolved initial DI errors but OOM persisted.
    - **Insight:** OOM seemed related to full dependency graph resolution, specifically involving `InterpreterService` -> `DirectiveService` -> All Handlers.
    - **Strategy:** Refactor `DirectiveService` and handlers to use DI properly (Steps 1-4 below).
    - **Step 1 (ImportDirectiveHandler DI): COMPLETE.** Refactored handler to inject `ICircularityService`.
    - **Step 2 (Handlers Injectable): COMPLETE.** Verified all default handlers were already `@injectable`.
    - **Step 3 (DirectiveService DI): COMPLETE.** Refactored `DirectiveService` to use `@injectAll('IDirectiveHandler')`. Fixed associated unit tests (`DirectiveService.test.ts`).
    - **Step 4 (Global DI Config): COMPLETE.** Registered all default handlers with the `IDirectiveHandler` token in `core/di-config.ts`.
    - **Step 5 (Validation): COMPLETE.** `DirectiveService.test.ts` and `api/smoke.test.ts` are passing after fixing circular dependency with `tsyringe.delay()`.
    - **Step 6 (Continue Integration Refactor - Diagnosis):**
        *   Applied minimal DI pattern to `api/api.test.ts`.
        *   Encountered "Run directive command cannot be empty" errors.
        *   **Debugging `@run`:** Added extensive `process.stdout.write` logging.
            *   Confirmed `ResolutionService.resolveNodes` returned correct command string.
            *   Confirmed `RunDirectiveHandler` received correct command string.
            *   Identified state propagation/map key issues (FIXED).
            *   **Isolated Failure:** Logs showed the command string was correct *just before* the error was thrown. The error seemed anomalous.

## 3. Root Cause Hypothesis (Revised Further)

- OOM/Initial DI errors resolved by core DI refactor and `delay()`.
- State/Map key issues in `@run` fixed.
- The persistent "Run directive command cannot be empty" error was **misleading**. Debugging revealed:
    1.  The error originated from `RunDirectiveValidator.ts` (called via `ValidationService`), which performed a premature empty check *before* variables were resolved.
    2.  Error wrapping in `InterpreterService.callDirectiveHandleDirective` initially obscured the true source.
- **Current Problem:** After fixing the validator and error wrapping, the original `@run` test failures are resolved, but two *new* assertion failures occur in `api/api.test.ts` related to variable resolution (e.g., `expect(result).toContain('Hello')` fails when `{{greeting}}` was used).
- **Current Hypothesis:** The variable resolution failures (`greeting`, `name` not found by `VariableReferenceResolver`) are caused by **incorrect DI setup in `api/api.test.ts`**. The child container (`testContainer`) used for the tests is missing registrations for core services (`IStateService`, `IResolutionService`, etc.). This likely causes `VariableReferenceResolver` to receive the wrong state instance (e.g., the global one, or an incomplete mock missing `getAllVariables`) during resolution lookups initiated within the `processMeld` call.

## 4. Revised Strategy

Fix the root cause of the variable resolution failures by ensuring the test-specific DI container in `api/api.test.ts` is correctly configured with all necessary service implementations. Once `api.test.ts` passes, continue the broader integration test refactoring.

## 5. Next Steps

1.  **Fix DI in `api.test.ts`:** Edit `api/api.test.ts`. In the `beforeEach` block, add registrations to the `testContainer` for all core services and their interfaces required by `processMeld` and its dependencies (e.g., `IStateService`, `IResolutionService`, `IPathService`, `IFileSystemService`, `IDirectiveService`, `IInterpreterService`, `IOutputService`, handlers, client factories). Ensure these registrations use the actual service implementations.
2.  **Re-validate `api/api.test.ts`:** Run `npm test api/api.test.ts`. Verify that the two assertion failures related to variable resolution are now fixed.
3.  **Continue Integration Test Refactor:** Once `api/api.test.ts` passes reliably:
    *   Apply the minimal DI pattern (register `IFileSystem` + Logger mock in child container, pass container to `processMeld`) to `api/integration.test.ts` and `api/resolution-debug.test.ts`. Fix any resulting test failures.
    *   Fix the build error in `api/array-access.test.ts` (manual syntax correction).
    *   Refactor `cli/cli.test.ts` if necessary, ensuring it uses the correctly configured API layer.
4.  **Final Validation:** Run `npm test api cli` to ensure all integration tests pass.
5.  **Cleanup:** Remove all `process.stdout.write` debug logs from `RunDirectiveHandler.ts`, `DirectiveService.ts`, `VariableReferenceResolver.ts`, etc. 