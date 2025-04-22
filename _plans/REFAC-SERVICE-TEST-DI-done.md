# Plan: Refactor Service Tests for Proper DI Isolation

## Goal

Systematically refactor service-level unit and integration tests (`tests/services/**/*.test.ts`) to use properly isolated manual child DI containers with explicit dependency registration. This will resolve the widespread test failures introduced after improving container cleanup logic (`TestContextDI.cleanup` using `dispose()`) and ensure tests adhere to the standards documented in `docs/dev/TESTS.md`.

## Problem Context

- Improving the `TestContextDI.cleanup` method to use `container.dispose()` instead of `container.clearInstances()` exposed fragility in many service-level tests.
- Over 400 failures occurred in `npm test services`, indicating these tests were likely implicitly relying on the global container or state leaking between tests due to incomplete container cleanup.
- Many failing tests do not follow the recommended "Manual Child Container" pattern from `docs/dev/TESTS.md`, which involves creating a dedicated child container per test (or suite) and explicitly registering all dependencies.

## Strategy

The core strategy is to apply the "Manual Child Container" pattern consistently across all failing service tests:

1.  **Identify Failing Files:** Start with the output of `npm test services` to list failing test files.
2.  **Iterative Refactoring:** Address failures file-by-file or service-by-service.
3.  **Apply Manual Container Pattern:** For each failing test file (`describe` block):
    *   **`beforeEach`:**
        *   Create a fresh child container: `let testContainer: DependencyContainer; testContainer = container.createChildContainer();`
        *   Register Infrastructure Mocks: Use `TestContextDI` *only* for `IFileSystem` if needed (`context = TestContextDI.createIsolated(); testContainer.registerInstance('IFileSystem', context.fs);`), otherwise mock manually. Register mock logger (`testContainer.registerInstance('MainLogger', ...)`).
        *   Register Mocks: Create manual mock objects for direct dependencies (using `vi.fn()`, `vi.spyOn`). Register these mocks in `testContainer` using the correct token (Class name for factories/services, String token for interfaces like `'IMyInterface'`).
        *   Register Real Implementations: Register the actual class implementation for the service-under-test (`testContainer.register('IMyService', { useClass: MyService })`). Register any *real* dependencies needed for the test that aren't mocked.
        *   **Crucially:** Register the container itself: `testContainer.registerInstance('DependencyContainer', testContainer);` (Needed by factories).
        *   Resolve Service: Resolve the service-under-test from the `testContainer`: `const service = testContainer.resolve<IMyService>('IMyService');`.
    *   **`afterEach`:**
        *   Dispose the container: `testContainer?.dispose();`.
        *   Clean up `TestContextDI` if used: `await context?.cleanup();`.
4.  **Verify:** Run the specific test file (`npm test services/<path>/<file>.test.ts`) frequently to confirm fixes. Run `npm test services` periodically to track overall progress.

## Refactoring Phases (Suggested Order)

This order prioritizes foundational services:

1.  **Phase 1: Core FS & Path Services:**
    *   Target: `tests/services/fs/`
    *   Files: `FileSystemService.test.ts`, `PathService.test.ts`, etc.
2.  **Phase 2: State Management:**
    *   Target: `tests/services/state/`
    *   Files: `StateService.test.ts`, `StateFactory.test.ts`, etc.
3.  **Phase 3: Resolution Services:**
    *   Target: `tests/services/resolution/`
    *   Files: `ResolutionService.test.ts`, `ValidationService.test.ts`, `CircularityService.test.ts`.
4.  **Phase 4: Core Pipeline Services:**
    *   Target: `tests/services/pipeline/` (excluding handlers for now)
    *   Files: `ParserService.test.ts`, `InterpreterService.unit.test.ts` (integration tests likely use API setup), `OutputService.test.ts`, `DirectiveService.test.ts`.
5.  **Phase 5: Directive Handlers:**
    *   Target: `tests/services/pipeline/DirectiveService/handlers/`
    *   Files: Systematically refactor tests for each handler (`TextDirectiveHandler.test.ts`, `ImportDirectiveHandler.test.ts`, etc.).
6.  **Phase 6: Utilities & Other:**
    *   Address any remaining failing tests under `tests/services/`.

## Verification

-   The primary goal is a clean run of `npm test services`.
-   Confirm that `npm test api` still passes (or that remaining failures are unrelated OOM/`@run`/`@path` issues tracked separately).

## Potential Challenges & Considerations

-   **Transitive Dependencies:** Identifying *all* necessary registrations for a service, including dependencies of dependencies, can be tricky. Careful analysis of constructor signatures and potential runtime errors will be needed.
-   **Mock Complexity:** Creating accurate manual mocks for complex services or factories might require effort.
-   **Test Logic:** Some test logic might need adjustments once proper isolation is in place (e.g., assertions that implicitly relied on leaked state).

## Next Step

Start Phase 1 by running `npm test services/fs` and refactoring the failing tests within that directory according to the "Manual Child Container" pattern. 