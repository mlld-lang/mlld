# Define an Improved Mocking Strategy

## Context

You are the **Test Architect**. A consolidated analysis of the current mocking practices across various test suites has been completed.

1.  **Overall Goal:** {{ overallGoal }}
2.  **Core Test Utilities:** {{ coreUtils }}
3.  **Core Service Interfaces:** {{ coreInterfaces }}
4.  **Consolidated Mock Analysis Report:**
    {{ consolidated_analysis }}

---

## Task: Propose a Concrete Mocking Strategy

Based on the consolidated analysis, propose a clear and consistent strategy for creating, registering, and customizing mocks in the Meld test environment. Your proposal should aim to address the identified problems (inconsistencies, type errors, runtime errors, boilerplate).

**Address the following key decision points:**

1.  **Role of `TestContextDI` Default Mocks:**
    *   Should `TestContextDI` provide complete, type-accurate default mocks for core services (that tests resolve and spy on)?
    *   Or should `TestContextDI` provide minimal/no default mocks, requiring tests to explicitly create/register what they need (potentially using shared factories)?
    *   **Justify your recommendation.**

2.  **Shared Mock Objects/Factories:**
    *   Should we create a central place (e.g., `tests/mocks/serviceMocks.ts`) for reusable, type-accurate base mock objects or factory functions (e.g., `createMockStateService()` returning an `IStateService` with `vi.fn()` stubs)?
    *   **Justify your recommendation.**

3.  **Mock Customization:**
    *   What should be the standard way to customize mock behavior for specific tests? (e.g., `vi.spyOn` on resolved mocks, configuring mocks via factory options, directly modifying mock object properties).
    *   **Explain the pros and cons.**

4.  **Ensuring Interface Alignment:**
    *   How can we best ensure mocks stay synchronized with evolving service interfaces to prevent type errors?

**Output Format:** Produce a clear markdown document outlining the proposed strategy.

### Proposed Mocking Strategy for Meld Tests

**1. Role of `TestContextDI` Defaults:**

*   **(Proposal - e.g., Enhance Defaults):** `TestContextDI` should be enhanced to register complete, type-accurate default mocks for all core injectable services listed in `core/di-config.ts`. These mocks should implement all interface methods with basic `vi.fn()` stubs.
*   **Justification:** (e.g., Leverages existing DI setup, reduces boilerplate in individual tests, provides a consistent base, allows tests to focus on spying/overriding specific behaviors.)
*   **(Alternative Proposal - e.g., Minimize Defaults):** `TestContextDI` should only register essential, non-service utilities (like the filesystem). Tests will explicitly create/register all service mocks using shared factories.
*   **Justification:** (e.g., More explicit test setup, avoids potential issues with complex default mocks, encourages thinking about specific dependencies needed.)

**2. Shared Mock Objects/Factories:**

*   **(Proposal - e.g., Use Factories):** Yes, create a `tests/mocks/serviceMocks.ts` (or similar) containing factory functions (e.g., `createMockResolutionService(): IResolutionService`) that return new mock instances implementing the full interface with `vi.fn()` stubs.
*   **Justification:** (e.g., Promotes reuse, centralizes mock definitions making updates easier, ensures type accuracy.)
*   **(Alternative - e.g., No Shared Objects):** No, tests should create manual mocks as needed directly within the `beforeEach`.
*   **Justification:** (e.g., Simpler for trivial mocks, avoids potential complexity of shared factories.)

**3. Mock Customization Approach:**

*   **(Proposal - e.g., `vi.spyOn`):** The standard approach should be to resolve the default/factory-created mock instance from the `TestContextDI` container and use `vi.spyOn(resolvedMockInstance, 'methodName').mockImplementation(...)` to define specific behavior for a test suite.
*   **Justification:** (e.g., Clear and standard Vitest pattern, keeps base mocks clean, allows targeted overrides.)

**4. Ensuring Interface Alignment:**

*   **(Proposal):** Regularly run TypeScript checks (`tsc --noEmit`) as part of CI/local builds. Leverage TypeScript's strictness - if an interface changes, tests using outdated mock factories/objects should fail compilation. Manually update the shared mock factories/objects promptly when interfaces change.

**Summary Recommendation:**

*   (e.g., Enhance `TestContextDI` defaults AND provide shared mock factories. Tests primarily resolve defaults and use `vi.spyOn`. Factories are available for more complex scenarios or when replacing a default entirely.) 