# Plan: Implement New Mocking Strategy (Methodical Rollout)

## 1. Goal

Implement the new, standardized mocking strategy proposed in the `_cmte/audit-mocks/output/03-propose-mock-strategy.define-mock-strategy.md` audit result. This aims to improve test consistency, type safety, maintainability, and DI integration across the Meld test suite, using an incremental and investigative approach.

**References:**
*   **Strategy Proposal:** `_cmte/audit-mocks/output/03-propose-mock-strategy.define-mock-strategy.md`
*   **Analysis Findings:** `_cmte/audit-mocks/output/02-synthesize-mock-findings.consolidate-mock-analysis.md`

**Key Components of the New Strategy:**
*   Centralized `MockFactory` (`tests/utils/mocks/MockFactory.ts`).
*   Dedicated `ClientFactoryHelpers` (`tests/utils/mocks/ClientFactoryHelpers.ts`).
*   Enhanced `TestContextDI` (`tests/utils/di/TestContextDI.ts`) with helpers (`setupMinimal`, `setupWithStandardMocks`).
*   Reusable `TestFixtures` (e.g., `DirectiveTestFixture`, `InterpreterTestFixture`).
*   Standard mock customization via `vi.spyOn` on resolved mocks.

## 2. Implementation Phases (Methodical Rollout)

### Phase 1: Implement Core Mock Utilities (No Integration Yet)
*   **Objective:** Create the foundational mock utilities without modifying existing tests or `TestContextDI`.
*   **Tasks:**
    1.  Create `tests/utils/mocks/MockFactory.ts`. Implement static factory methods (`createStateService`, etc.) ensuring accurate interface matching based on previous checks and the strategy proposal.
    2.  Create `tests/utils/mocks/ClientFactoryHelpers.ts`. Implement `registerClientFactory` and `registerStandardClientFactories`, ensuring all necessary client factories (including `ParserServiceClientFactory`) are mocked.
*   **Verification:** Manually review the created files against the service interfaces and the strategy document. Ensure method signatures are correct.

### Phase 2: Verify `MockFactory` in Isolation (Simple Test Case)
*   **Objective:** Confirm the `MockFactory` produces usable mocks in a simple, controlled test environment.
*   **Tasks:**
    1.  Identify a simple, self-contained test file (e.g., a single directive handler test with minimal external dependencies).
    2.  In that test file's `beforeEach`:
        *   Keep the existing `TestContextDI` setup for resolving the *service under test*.
        *   *Manually* import `MockFactory`.
        *   Create required mock dependencies using `MockFactory.createXService()`.
        *   Register these factory-created mocks with the `TestContextDI` instance using `context.registerMock()`.
    3.  Adapt the tests in that file to use the factory-created mocks (using `vi.spyOn` on these mocks for specific behavior).
*   **Verification:** Run tests *only for this specific file*. Debug any issues. Confirm the factory-created mocks function correctly in this limited scope.

### Phase 3: Verify `ClientFactoryHelpers` in Isolation (Simple Test Case)
*   **Objective:** Confirm the `ClientFactoryHelpers` correctly mock and register client factories for services with circular dependencies.
*   **Tasks:**
    1.  Identify a simple test file involving a service known to use a client factory (e.g., `FileSystemService` or `PathService` tests, if simple ones exist, or create a dedicated small test).
    2.  In that file's `beforeEach`:
        *   Keep the existing `TestContextDI` setup.
        *   *Manually* import `ClientFactoryHelpers`.
        *   Call `ClientFactoryHelpers.registerStandardClientFactories(context)` or `registerClientFactory` as needed.
    3.  Adapt the test to verify the interaction with the mocked client factory / client instance.
*   **Verification:** Run tests *only for this specific file*. Debug issues with client factory mock registration and usage.

### Phase 4: Integrate Factories into `TestContextDI` Helpers
*   **Objective:** Refactor `TestContextDI` to leverage the verified `MockFactory` and `ClientFactoryHelpers`.
*   **Tasks:**
    1.  Edit `tests/utils/di/TestContextDI.ts`.
    2.  Import `MockFactory` and `ClientFactoryHelpers`.
    3.  Implement the proposed helper methods (`setupMinimal`, `setupWithStandardMocks`) ensuring they:
        *   Use `MockFactory.standardFactories` for default service mocks.
        *   Use `ClientFactoryHelpers.registerStandardClientFactories` to handle default client factory mocks.
        *   Register other essential mocks (like `IFileSystem`, `DirectiveLogger`).
    4.  Refactor the internal `registerServices` (or equivalent initialization logic) to use these defaults cleanly.
*   **Verification:** Create a *new*, simple test file (`tests/utils/di/TestContextDIHelpers.test.ts`?) specifically to test the `setupWithStandardMocks` and `setupMinimal` helpers. Verify they create a context and provide the expected default mocks.

### Phase 5: Gradual Migration Using `TestContextDI` Helpers (Simple -> Complex)
*   **Objective:** Update existing test suites to use the new helpers, starting with simpler ones.
*   **Tasks:**
    1.  Refactor the simple test file(s) modified in Phase 2/3 to now use `helpers.setupWithStandardMocks()`.
    2.  Select another relatively simple test file (e.g., another handler, `StateEventService.test.ts`?). Refactor using the helpers and `vi.spyOn` for test-specific mocks.
    3.  Run tests specifically for the refactored file and debug any issues.
    4.  Continue this process incrementally, file by file or small group by small group.
    5.  **Defer** the most complex/problematic files (`ResolutionService.test.ts`, `PathService.test.ts`, `CLIService.test.ts`, `InterpreterService.unit.test.ts`) until later in this phase or Phase 7.
*   **Verification:** Test each refactored file individually. Periodically run `npm test services` to track progress, but expect failures until most files are migrated.

### Phase 6: Introduce & Verify Test Fixtures
*   **Objective:** Create and utilize test fixtures for common, complex setups like directive and interpreter testing.
*   **Tasks:**
    1.  Create `tests/utils/fixtures/DirectiveTestFixture.ts` (ensure it uses the new `TestContextDI` helpers).
    2.  Refactor relevant handler tests (e.g., `TextDirectiveHandler.test.ts`) to use `DirectiveTestFixture`. Debug fixture usage.
    3.  Create `tests/utils/fixtures/InterpreterTestFixture.ts` (ensure it uses the new `TestContextDI` helpers).
    4.  Refactor relevant interpreter tests (e.g., `InterpreterService.unit.test.ts`) to use `InterpreterTestFixture`. Debug fixture usage. Address the `NodeFactory.js` import error here if it still exists.
*   **Verification:** Run tests specifically for fixture-using files. Ensure fixtures provide the correct setup and simplify the tests.

### Phase 7: Tackle Complex Test Suites
*   **Objective:** Apply the verified strategy, helpers, and potentially fixtures to the most complex test suites identified earlier.
*   **Tasks:**
    1.  Refactor `ResolutionService.test.ts`. Focus on:
        *   Correctly mocking internal client calls (`ParserServiceClient`, `VariableReferenceResolverClient` etc.) needed for specific resolution paths, likely using `vi.spyOn` on the client instances obtained via `ClientFactoryHelpers`.
        *   Resolving the `ResolutionContext.withStrict` issue (revisit factory/type/usage).
    2.  Refactor `PathService.test.ts`, focusing on correct `FileSystemServiceClient` mocking for different validation scenarios.
    3.  Refactor `CLIService.test.ts`, ensuring `IFileSystemService.exists` and file writing/reading are mocked correctly for test cases.
*   **Verification:** Focused debugging and testing for these specific complex files. Ensure mocks accurately reflect the service's interactions.

### Phase 8: Validation & Cleanup
*   **Objective:** Ensure the new strategy is fully implemented, stable, and documented.
*   **Tasks:**
    1.  Run the *entire* test suite (`npm test`) and fix any remaining failures.
    2.  Address previously skipped tests, attempting to enable and fix them using the new mocking strategy.
    3.  Perform a final review for consistency across test files.
    4.  Remove any old/unused mock utilities or helper functions (e.g., from `serviceMocks.js`).
    5.  Update testing documentation (`docs/dev/TESTS.md` or similar) to reflect the new standard mocking strategy.
    6.  Ensure TypeScript checks (`tsc --noEmit`) pass cleanly.

## 3. Next Steps

*   Begin Phase 1: Create `MockFactory.ts` and `ClientFactoryHelpers.ts`. 