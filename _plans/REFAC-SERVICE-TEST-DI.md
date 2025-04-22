# Plan: Refactor Service Tests for Proper DI Isolation

## Goal

Systematically refactor service-level unit and integration tests (`tests/services/**/*.test.ts`) to use properly isolated manual child DI containers with explicit dependency registration. This will resolve the widespread test failures introduced after improving container cleanup logic (`TestContextDI.cleanup` using `dispose()`) and ensure tests adhere to the standards documented in `docs/dev/TESTS.md`.

## Problem Context

- Improving the `TestContextDI.cleanup` method to use `container.dispose()` instead of `container.clearInstances()` exposed fragility in many service-level tests.
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


## List of remaining tests (delete each test as it is is completed)

services/resolution/ValidationService/ValidationService.test.ts

services/cli/CLIService/CLIService.test.ts
services/sourcemap/SourceMapService.test.ts
services/state/StateEventService/StateEventService.test.ts
services/state/utilities/StateVariableCopier.test.ts

## Verification

-   The primary goal is a clean run of `npm test services`.
-   Confirm that `npm test api` still passes (or that remaining failures are unrelated OOM/`@run`/`@path` issues tracked separately).

## Potential Challenges & Considerations

-   **Transitive Dependencies:** Identifying *all* necessary registrations for a service, including dependencies of dependencies, can be tricky. Careful analysis of constructor signatures and potential runtime errors will be needed.
-   **Mock Complexity:** Creating accurate manual mocks for complex services or factories might require effort.
-   **Test Logic:** Some test logic might need adjustments once proper isolation is in place (e.g., assertions that implicitly relied on leaked state).
