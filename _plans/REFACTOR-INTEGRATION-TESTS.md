# Plan: Refactor Integration Tests for Real Service Usage

## 0. Context for Next Session

**Last Known State (after trying to register more real services in `api.test.ts`):**

*   **Passing:** `services/cli/CLIService/CLIService.test.ts`, `InterpreterService.integration.test.ts` (after its own refactor).
*   **Build Error:** `api/array-access.test.ts` has a persistent syntax error introduced during mocking refactors (currently skipped via rename).
*   **Failing (`api.test.ts`, `api/nested-array.test.ts`):** These fail assertion errors. `processMeld`, when called with test content and the manual container, often returns unexpected results (e.g., empty strings, missing variable substitutions) instead of the correctly processed output. Spies on internal methods also fail.
*   **Failing (`api/integration.test.ts`):** This suite (using its own manual container setup) has multiple assertion failures:
    *   Variable resolution/state access issues (e.g., `expected undefined to be defined`, `expected '...' to contain 'Value 1'`).
    *   Path validation tests fail (`promise rejected "PathValidationError: Invalid path format { ... reason: 'Client not initialized' }"`). Mocking/registering `FileSystemServiceClientFactory` and `PathOperationsService` did *not* fix this.
    *   Circular import test resolves instead of rejecting.
*   **Failing (`cli/cli.test.ts`):** Many tests fail generically (`Process exited with code 1`) or with incorrect error messages, likely due to the underlying API test failures.
*   **Failing (`api/resolution-debug.test.ts`):** Tests fail due to incorrect structure (`main is not a function`).

**Core Challenges Identified:**

1.  **`processMeld` Behavior in Tests:** The main hurdle is getting `processMeld` to function correctly when provided with a manually configured `testContainer`. Variable resolution (`{{var}}`) and directive execution (`@run`) often don't produce the expected output string, even when registering *most* real services. This suggests issues with how the remaining mocks interact with the real services inside `processMeld` or potential problems in the services themselves masked by previous tests.
2.  **`api/integration.test.ts` Path Validation:** The `PathValidationError` persists despite trying various mocking/registration strategies for `FileSystemServiceClientFactory` and its dependencies. The root cause is unclear.
3.  **Stubborn Syntax Error:** `api/array-access.test.ts` requires manual intervention to fix the build error.

**Current Strategy Reminder:**

*   Use manual child containers (`container.createChildContainer()`).
*   Register `IFileSystem` with `MemfsTestFileSystem`.
*   Register essential infrastructure mocks (e.g., `DirectiveLogger`).
*   Pass the `testContainer` to `processMeld` via `options.container`.
*   Attempt to use REAL services registered in the `testContainer` as much as possible, resorting to minimal, targeted mocks only when necessary or for specific error condition tests.
*   Focus assertions on the public API boundaries (`processMeld` output string, errors thrown) rather than internal spies.

**Immediate Next Steps (Start of Next Session):**

1.  **Fix `api/array-access.test.ts` Build Error:** Manually inspect lines ~32-45 and correct the syntax errors in the mock definitions.
2.  **Re-evaluate `api.test.ts` / `nested-array.test.ts`:** Since registering real `ResolutionService`/`PathService` didn't fix output errors, the problem might be the *mocked* `ParserServiceClientFactory`. **Action:** Register the *real* `ParserServiceClientFactory` in these files and see if variable/directive execution works correctly in the `processMeld` output.
3.  **Re-evaluate `api/integration.test.ts` Path Errors:** Since mocking *and* using the real FS Client Factory both failed, investigate `PathService.validatePath` and `checkExistenceAndType` more deeply. Is there another dependency or state affecting it? Try simplifying the test cases.

---

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