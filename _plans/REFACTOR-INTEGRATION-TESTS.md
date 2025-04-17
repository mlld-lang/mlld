# Plan: Refactor Integration Tests for Real Service Usage

## 1. Goal

Refactor API (`api/`) and CLI (`cli/`) integration tests to eliminate reliance on potentially problematic mock infrastructure (`TestContextDI` helpers, excessive `mock<T>()`). Instead, these tests should utilize the *real* service implementations as registered in `core/di-config.ts`, mocking only essential environmental dependencies like the filesystem (`IFileSystem` using `MemfsTestFileSystem`). This aims to make integration tests more robust, reliable, and truly reflective of component interactions.

## 2. Motivation

Current integration tests are failing due to complex DI issues and assertion errors. Using extensive mocks or relying on helper contexts like `TestContextDI` for full DI setup can obscure real integration problems (like missing global registrations or incorrect service interactions) and makes debugging difficult and tests brittle.

## 3. Proposed Strategy

*   **Minimal Mocking:** Integration tests will create clean DI child containers (`container.createChildContainer()`). Within these containers, only the `IFileSystem` token will be explicitly registered, bound to an instance of `MemfsTestFileSystem` (obtained from `TestContextDI` or created manually).
*   **Real Service Resolution:** All other services required by the API (`api/index.ts:processMeld`) or CLI (`cli/index.ts`) entry points will ideally be resolved through the DI container, which will inherit the *real* service registrations from `core/di-config.ts`. This tests the application's actual wiring.
*   **Explicit Registration Where Needed:** If real services have dependencies not globally registered in `di-config.ts` (e.g., specific loggers like `DirectiveLogger`, potentially `PathOperationsService` for `PathService`), these must be explicitly registered in the test container (usually with mocks).
*   **Test Focus:** Tests will primarily interact with the public API (`processMeld`) or simulate CLI execution, verifying outcomes based on inputs provided via the `MemfsTestFileSystem`. Assertions should focus on the final output (returned string, exit code, console output) or expected errors.
*   **Targeted Mocking:** Direct interaction with or mocking of internal services within tests should be minimized. If mocks *are* necessary (e.g., for a factory used by a real service), prefer manual mock objects (`{ method: vi.fn(), requiredProp: undefined } as unknown as MyType`) combined with `vi.spyOn` over `mock<T>()` where `vi.spyOn` issues have been observed.

## 4. Implementation Phases

**Phase 1: Stabilize Core DI & Basic API Test**

*   **Objective:** Ensure the fundamental DI setup with real services (using `MemFs`) works correctly when called via `processMeld` from a controlled test environment.
*   **Tasks:**
    1.  ✅ **Verify `core/di-config.ts`:** Confirmed core services and `IFileSystem` registration exist.
    2.  ✅ **Create Plan Document:** This document.
    3.  **Select Target Test:** Choose a simple API test file that primarily uses `processMeld`. Avoid `api/array-access.test.ts` due to build errors. **Suggestion: Start with `api/nested-array.test.ts`** (which passed after initial refactor) or create `api/minimal.test.ts`.
    4.  **Refactor Target Test:**
        *   Use `TestContextDI.createIsolated()` + `initialize()` mainly to get `context.fs`.
        *   In `beforeEach`:
            *   Instantiate `let memFs = context.fs;` (or `new MemfsTestFileSystem()`).
            *   Create a child container: `const testContainer = container.createChildContainer();`.
            *   Register the mock FS: `testContainer.registerInstance<IFileSystem>('IFileSystem', memFs);`.
            *   Register *mocks* for known essential infrastructure not in global scope (e.g., `testContainer.registerInstance<ILogger>('DirectiveLogger', mock<ILogger>());`).
        *   Update test logic to use `memFs.writeFile` for setup.
        *   Update test calls to `await processMeld(contentString, { container: testContainer, fs: memFs as any })`. **Crucially, pass the `testContainer`**. Remove the old `services` option.
        *   Adjust assertions to check the string output of `processMeld`.
    5.  **Run & Debug:** Execute `npm test <target_test_file>`. Debug DI resolution errors within `processMeld`. Check:
        *   Is `processMeld` using the passed `testContainer`?
        *   Are all dependencies needed by *real* services resolved by `processMeld` (either via global `di-config` or explicit `testContainer` registration) present?

**Phase 2: Refactor Remaining API Tests & Address `main` Error**

*   **Objective:** Apply the stabilized DI strategy across all API tests and fix unrelated errors.
*   **Tasks:**
    1.  **Incrementally Refactor:** Apply the refactoring steps from Phase 1.4 to the remaining API test files (`api/api.test.ts`, `api/integration.test.ts`, `api/nested-array.test.ts` *if not done in P1*, `api/resolution-debug.test.ts`) one by one.
        *   Pay attention to registering dependencies needed by *real* services being used implicitly by `processMeld` (e.g., `PathOperationsService` if using real `PathService`, potentially real factories like `FileSystemServiceClientFactory` if mocks cause issues).
        *   Redesign or remove tests relying heavily on internal state checks or complex mock setups not testable via the `processMeld` public API.
    2.  **Fix `main is not a function`:**
        *   Analyze `cli/index.ts` export structure.
        *   Modify `api/resolution-debug.test.ts` to correctly import and invoke the intended CLI functionality.
    3.  **Run & Debug:** After refactoring each file, run `npm test <refactored_file>` and debug new failures, focusing on DI and assertion logic against `processMeld` output.

**Phase 3: Analyze & Fix API Integration Failures**

*   **Objective:** Resolve the actual integration failures now that DI setup issues are eliminated.
*   **Tasks:**
    1.  **Run Full API Suite:** Execute `npm test api` (excluding skipped files).
    2.  **Analyze Failures:** Systematically investigate remaining errors (e.g., incorrect output strings in `api.test.ts`, path validation errors, state issues like `getDataVar` returning undefined, circular import detection failures in `api/integration.test.ts`).
    3.  **Debug Service Interactions:** If necessary, use logging within *real* services (temporarily) or step-debugging to trace the execution flow through the relevant services (`InterpreterService`, `StateService`, `PathService`, `FileSystemService`, `ResolutionService`, etc.) invoked by `processMeld` to pinpoint root causes.
    4.  **Implement Fixes:** Correct logic within the services, DI configuration, or test expectations.

**Phase 4: Refactor CLI Tests**

*   **Objective:** Align CLI tests (`cli/cli.test.ts`) with the real-service testing strategy.
*   **Tasks:**
    1.  **Analyze `cli/cli.test.ts`:** Confirm how it invokes the CLI and handles mocks (it seems to use `mockProcessExit`, `mockConsole`, etc., which is appropriate).
    2.  **Ensure Mock FS:** Ensure the CLI logic (`cli/index.ts`), when run via the test, uses a `MemfsTestFileSystem`. This likely happens correctly if the API layer (`processMeld`) it calls uses the container where `MemFs` is registered (as planned in previous phases).
    3.  **Verify Mocks:** Ensure necessary CLI environment mocks (`process.argv`, `process.exit`, `console`) are effective.

**Phase 5: Analyze & Fix CLI Integration Failures**

*   **Objective:** Resolve remaining CLI test failures.
*   **Tasks:**
    1.  **Run CLI Suite:** Execute `npm test cli`.
    2.  **Analyze Failures:** Investigate assertion errors (likely comparing expected console output/exit codes to actuals). These should now reflect genuine discrepancies with the CLI running against (mostly) real services.
    3.  **Debug CLI Logic:** Trace execution within `cli/index.ts` and its interaction with `processMeld`.
    4.  **Implement Fixes:** Correct CLI logic or test assertions.

**Phase 6: Final Pass & Cleanup**

*   **Objective:** Ensure overall stability and clean up.
*   **Tasks:**
    1.  **Fix `api/array-access.test.ts`:** Revisit the build error in this file. Try fixing the syntax manually or rewriting the mocks cleanly.
    2.  **Run Full Suite:** Execute `npm test api cli`. Fix any remaining failures.
    3.  **Code Review:** Review refactored tests.
    4.  **Remove Obsolete Code:** Delete `TestContextDI` and related helpers if fully removed from these tests.
    5.  **Update Documentation:** Modify `docs/dev/TESTS.md` to reflect the final, successful integration testing strategy, including notes on manual containers, minimal mocking, `processMeld` usage, and handling DI.

--- 