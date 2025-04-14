# Plan: Implement New Mocking Strategy

## 1. Goal

Implement the new, standardized mocking strategy proposed in the `_cmte/audit-mocks/output/03-propose-mock-strategy.define-mock-strategy.md` audit result. This aims to improve test consistency, type safety, maintainability, and DI integration across the Meld test suite.

**Key Components of the New Strategy:**

*   Centralized `MockFactory` (`tests/utils/mocks/MockFactory.ts`) providing type-accurate base mocks for core services.
*   Enhanced `TestContextDI` (`tests/utils/di/TestContextDI.ts`) with helper methods (e.g., `setupWithStandardMocks`) to streamline test setup using the `MockFactory`.
*   Dedicated `ClientFactoryHelpers` (`tests/utils/mocks/ClientFactoryHelpers.ts`) for testing circular dependencies resolved via client factories.
*   Reusable `TestFixtures` (e.g., `DirectiveTestFixture`) for common testing scenarios.
*   Standard mock customization via `vi.spyOn` on resolved mocks.
*   Emphasis on TypeScript for interface alignment.

## 2. Implementation Phases

Based on the strategy proposal document.

### Phase 1: Foundation - MockFactory & TestContextDI Enhancements

*   **Objective:** Create the core `MockFactory` and integrate it into `TestContextDI`.
*   **Tasks:**
    1.  Create `tests/utils/mocks/MockFactory.ts`.
        *   Implement `MockFactory.standardFactories` map.
        *   Implement static factory methods (`createStateService`, `createResolutionService`, `createFileSystemService`, `createPathService`, etc.) based on the proposal, ensuring they return objects fully conforming to the latest service interfaces using `vi.fn()` stubs. Verify interface accuracy.
    2.  Refactor `TestContextDI.ts`:
        *   Modify the internal `registerServices` method (or similar initialization logic) to *use* the `MockFactory.standardFactories` instead of its own incomplete default mocks.
        *   Implement the proposed helper methods like `setupMinimal` and `setupWithStandardMocks` (or similar helpers based on final design).
    3.  Create `tests/utils/mocks/ClientFactoryHelpers.ts`.
        *   Implement `registerClientFactory` and `registerStandardClientFactories` based on the proposal. Ensure the client objects created within match the necessary client interfaces (`IPathServiceClient`, `IFileSystemServiceClient`, etc.).
    4.  **Initial Test:** Refactor `services/pipeline/DirectiveService/DirectiveService.test.ts` to use the new `TestContextDI` helpers and `vi.spyOn` for customization as a proof-of-concept. Aim to make all tests in this suite pass.

### Phase 2: Test Fixtures

*   **Objective:** Develop reusable fixtures for common, complex test setups.
*   **Tasks:**
    1.  Create `tests/utils/fixtures/DirectiveTestFixture.ts` based on the proposal.
        *   Ensure it correctly uses `TestContextDI` and `MockFactory` / `ClientFactoryHelpers`.
        *   Implement helper methods (`createDirectiveNode`, `executeHandler`, etc.).
    2.  Refactor relevant directive handler tests (e.g., `TextDirectiveHandler.test.ts`) to use `DirectiveTestFixture`.
    3.  Identify other areas suitable for fixtures (e.g., `InterpreterService` tests, end-to-end pipeline simulation tests) and create corresponding fixture classes (`InterpreterTestFixture`, etc.) as needed.

### Phase 3: Gradual Migration

*   **Objective:** Update existing test suites across the codebase to use the new strategy.
*   **Tasks:**
    1.  Prioritize migrating test suites with the most failures or complexity (e.g., `ResolutionService.test.ts`, `InterpreterService.unit.test.ts`, `PathService.test.ts`).
    2.  Systematically refactor `beforeEach` blocks in targeted test files:
        *   Replace manual/old mock setups with `TestContextDI` helpers (e.g., `setupWithStandardMocks`).
        *   Resolve necessary services/mocks from the context.
        *   Use `vi.spyOn` on resolved mocks for specific behavior overrides.
        *   Utilize test fixtures where appropriate.
        *   Remove `as any` casts where possible.
    3.  Fix any test logic errors uncovered during the migration. Aim to pass all tests in the migrated file.
    4.  Continue migrating remaining test files.

### Phase 4: Validation & Cleanup

*   **Objective:** Ensure the new strategy is fully implemented, stable, and documented.
*   **Tasks:**
    1.  Run the *entire* test suite (`npm test`) and fix any remaining failures.
    2.  Address previously skipped tests, attempting to enable and fix them using the new mocking strategy.
    3.  Perform a final review for consistency across test files.
    4.  Remove any old/unused mock utilities or helper functions.
    5.  Update testing documentation (`docs/dev/TESTS.md` or similar) to reflect the new standard mocking strategy.
    6.  Ensure TypeScript checks (`tsc --noEmit`) pass cleanly.

## 3. Next Steps

*   Begin Phase 1: Create `MockFactory.ts` and `ClientFactoryHelpers.ts`, then refactor `TestContextDI.ts`. 