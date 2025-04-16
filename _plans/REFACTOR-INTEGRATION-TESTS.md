# Plan: Refactor Integration Tests for Real Service Usage

## 1. Goal

Refactor API (`api/`) and CLI (`cli/`) integration tests to eliminate reliance on the mock-heavy `TestContextDI` infrastructure. Instead, these tests should utilize the *real* service implementations as registered in `core/di-config.ts`, mocking only essential environmental dependencies like the filesystem (`IFileSystem` using `MemfsTestFileSystem`). This aims to make integration tests more robust, reliable, and truly reflective of component interactions.

## 2. Motivation

Current integration tests are failing due to complex DI issues, likely stemming from the interaction between the mock infrastructure (`TestContextDI`, `MockFactory`, `ClientFactoryHelpers`) and the actual service dependency graph. Using extensive mocks in integration tests obscures real integration problems and makes debugging difficult.

## 3. Proposed Strategy

*   **Minimal Mocking:** Integration tests will create clean DI child containers. Within these containers, only the `IFileSystem` token will be explicitly registered, bound to an instance of `MemfsTestFileSystem`.
*   **Real Service Resolution:** All other services required by the API (`api/index.ts`) or CLI (`cli/index.ts`) entry points will be resolved through the DI container, which will inherit the *real* service registrations from `core/di-config.ts`.
*   **Test Focus:** Tests will primarily interact with the public API (`processMeld`) or simulate CLI execution, verifying outcomes based on inputs provided via the `MemfsTestFileSystem`. Direct interaction with or injection of internal services within tests will be minimized or eliminated.

## 4. Implementation Phases

**Phase 1: Stabilize Core DI & Basic API Test**

*   **Objective:** Ensure the fundamental DI setup with real services (using `MemFs`) works correctly within a controlled test environment.
*   **Tasks:**
    1.  ✅ **Verify `core/di-config.ts`:** Double-check that `core/di-config.ts` correctly registers *all* necessary real service classes and client factories required for the core pipeline (Parser, Interpreter, State, Resolution, Output, Path, FS, etc.) using appropriate Tsyringe methods (`register`, `registerSingleton`, `registerInstance`). Ensure circular dependencies are handled via registered factories. *(Self-correction: Verified core services and IFileSystem instance registration)*.
    2.  ✅ **Create Plan Document:** Create `_plans/REFACTOR-INTEGRATION-TESTS.md` (this document).
    3.  **Select Target Test:** Choose a relatively simple API test file (e.g., `api/array-access.test.ts` seems small, or create a new minimal `api/minimal.test.ts`). **Target: `api/array-access.test.ts`**
    4.  **Refactor Target Test:**
        *   Remove all usage of `TestContextDI`.
        *   In `beforeEach`:
            *   Instantiate `let memFs: MemfsTestFileSystem;`.
            *   Create a child container: `const testContainer = container.createChildContainer();`.
            *   Register the mock FS: `testContainer.registerInstance<IFileSystem>('IFileSystem', memFs);`.
        *   Update test logic to use `memFs.writeFile` for setup.
        *   Update test calls to `processMeld`, removing the `services` and `fs` options.
    5.  **Run & Debug:** Execute `npm test <target_test_file>`. Debug any DI resolution errors encountered during `processMeld` execution within this isolated context. Ensure the basic flow (resolve real services + mock FS) works.

**Phase 2: Refactor Remaining API Tests & Address `main` Error**

*   **Objective:** Apply the stabilized DI strategy across all API tests and fix unrelated errors.
*   **Tasks:**
    1.  **Incrementally Refactor:** Apply the refactoring steps from Phase 1.4 to the remaining API test files (`api/api.test.ts`, `api/integration.test.ts`, `api/nested-array.test.ts`, `api/resolution-debug.test.ts`) one by one.
        *   *Note:* Tests relying heavily on specific mock behaviors or internal state manipulation via `TestContextDI` might need significant redesign or removal if they are effectively unit tests disguised as integration tests. Focus on testing the documented API contract. Remove tests related to injecting broken/mock services via the `services` option, as that's no longer supported by the API. Remove debug-specific tests relying on `TestContextDI` helpers.
    2.  **Fix `main is not a function`:**
        *   Analyze `cli/index.ts` export structure.
        *   Modify `api/resolution-debug.test.ts` to correctly import and invoke the intended CLI functionality (likely instantiating `CLIService` or calling a specific exported function).
    3.  **Run & Debug:** After refactoring each file, run `npm test <refactored_file>` and debug any new failures.

**Phase 3: Analyze & Fix API Integration Failures**

*   **Objective:** Resolve the actual integration failures now that DI setup issues are eliminated.
*   **Tasks:**
    1.  **Run Full API Suite:** Execute `npm test api`.
    2.  **Analyze Failures:** Systematically investigate the remaining errors (e.g., `resultState.getTransformedNodes is not a function`, path validation errors, circular import detection failures). These should now point to genuine issues in how the real services interact.
    3.  **Debug Service Interactions:** Use logging or debugging techniques to trace the execution flow through the relevant services (`InterpreterService`, `StateService`, `PathService`, `FileSystemService`, `CircularityService`, etc.) to pinpoint the root cause of each failure.
    4.  **Implement Fixes:** Correct the logic within the services or their interactions.

**Phase 4: Refactor CLI Tests**

*   **Objective:** Align CLI tests (`cli/cli.test.ts`) with the real-service testing strategy.
*   **Tasks:**
    1.  **Analyze `cli/cli.test.ts`:** Understand how it currently invokes the CLI and handles DI/mocks (it might already be closer to the desired state or use its own mocks like `mockProcessExit`).
    2.  **Remove `TestContextDI` (if used):** Eliminate any reliance on the `TestContextDI` infrastructure.
    3.  **Ensure Mock FS:** Modify the test setup to ensure that when the CLI logic (`cli/index.ts`) runs, its DI container resolves `IFileSystem` to a `MemfsTestFileSystem` instance controlled by the test. This might involve:
        *   Passing a pre-configured test container to the CLI `main` function (if possible).
        *   Globally registering the `MemfsTestFileSystem` for `IFileSystem` *before* importing/running the CLI module within the test (potentially risky if tests run in parallel).
        *   Refactoring `cli/index.ts` slightly to allow injecting the container or specific services for testing purposes.
    4.  **Verify Mocks:** Ensure necessary CLI environment mocks (like `process.argv`, `process.exit`, `console.log`, `console.error`) are in place and functioning correctly.

**Phase 5: Analyze & Fix CLI Integration Failures**

*   **Objective:** Resolve remaining CLI test failures.
*   **Tasks:**
    1.  **Run CLI Suite:** Execute `npm test cli`.
    2.  **Analyze Failures:** Investigate assertion errors. These should now reflect discrepancies between expected CLI output/behavior and the actual results produced by the CLI running with (mostly) real services.
    3.  **Debug CLI Logic:** Trace execution within `cli/index.ts` and its interaction with the API layer (`processMeld`) to find the cause of assertion failures.
    4.  **Implement Fixes:** Correct CLI logic or test assertions.

**Phase 6: Final Pass & Cleanup**

*   **Objective:** Ensure overall stability and clean up remnants of the old approach.
*   **Tasks:**
    1.  **Run Full Suite:** Execute `npm test api cli`. Fix any remaining failures.
    2.  **Code Review:** Review the refactored tests for clarity and adherence to the new strategy.
    3.  **Remove Obsolete Code:** Delete `TestContextDI` if it's no longer used by any tests covered in this plan. Remove unused mock utilities if applicable.
    4.  **Update Documentation:** Modify `docs/dev/TESTS.md` (or similar) to describe the new integration testing approach, emphasizing minimal mocking and reliance on real services with `MemFs`.

--- 