# Science Notebook: ResolutionService Test Failures Investigation

**Objective:** Investigate and resolve the test failures in `services/resolution/ResolutionService/ResolutionService.test.ts`, focusing on understanding the root causes related to DI, mocking, and service instantiation, particularly why these tests fail when others using similar patterns succeed.

**Hypotheses (from _plans/RESOLUTION-ISSUES.md - To be tested):**

1.  **Instantiation Failure:** The `ResolutionService` instance is not being correctly created/returned by `testContext.resolve()` in `ResolutionService.test.ts`.
2.  **Missing Imports:** Specific error types (`VariableResolutionError`, `FieldAccessError`) are not imported in the test file.
3.  **Incorrect Mocking:** Mocking for `stateService.getCommandVar` (and potentially others) is misconfigured or doesn't match the refactored service interactions.

**Methodology:**

1.  **Isolate Instantiation Discrepancy (Hypothesis 1 - Prioritized):**
    *   **Compare Setups:** Analyze `ResolutionService.test.ts` and a working test file (e.g., `FileSystemService.test.ts`). Compare `TestContextDI` usage, mock registration (`registerMock`), service resolution (`context.resolve`), and the dependencies of the services themselves.
    *   **Add Logging:** Insert `process.stdout.write` logging inside the `ResolutionService` constructor to confirm if it's called during test setup in `ResolutionService.test.ts`.
    *   **Simplify `beforeEach`:** If necessary, temporarily simplify the `beforeEach` in `ResolutionService.test.ts` to *only* resolve the service, potentially adding mocks back incrementally, to pinpoint instantiation failures.
2.  **Verify Hypothesis 2 (Missing Imports):** *After* investigating instantiation, add missing error imports and check if any *remaining* test failures are resolved.
3.  **Analyze Mocking (Hypothesis 3 & Deeper Instantiation):** *After* investigating instantiation, systematically analyze mock implementations, focusing on `resolveCommand` tests and `stateService.getCommandVar`. Use logging within mocks.
4.  **Document Findings:** Record observations, successful steps, failed attempts, and revised hypotheses here.

---

## Investigation Log

**Date:** (Current Date)

**Entry 1:** Initial Setup
*   Created this notebook.
*   Reviewed `_plans/RESOLUTION-ISSUES.md` for initial hypotheses.
*   Reviewed `docs/dev/TESTS.md` for testing standards and logging quirks.
*   **Revised Plan:** Prioritize Methodology Step 1 (Isolate Instantiation Discrepancy) based on user feedback. Compare `ResolutionService.test.ts` with a working example like `FileSystemService.test.ts`.
*   Next Step: Read relevant files (`ResolutionService.test.ts`, `FileSystemService.test.ts`, `TestContextDI.ts`, `ResolutionService.ts`, `ServiceProvider.ts`) for comparison.

---

**Entry 2:** Comparing Test Setups (`ResolutionService.test.ts` vs. `FileSystemService.test.ts`)
*   Read `ServiceProvider.ts`, `ResolutionService.test.ts`, `FileSystemService.test.ts`.
*   **Key Difference Identified:** `FileSystemService.test.ts` mixes DI resolution (`context.resolve`) with direct instantiation (`new PathService(...)`, `new PathOperationsService()`, etc.) for some dependencies, even though it registers mocks for them. This is **not standard DI practice** and undermines the container's role. We will **not** replicate this pattern.
*   **Key Difference Identified:** `FileSystemService.test.ts` calls `context.initialize()` *twice*, once early and once after registering mocks/creating services. `ResolutionService.test.ts` calls `context.initialize()` *only once*, immediately after `TestContextDI.createIsolated()` and *before* registering mocks.
*   **Revised Hypothesis (Refining H1):** The primary issue in `ResolutionService.test.ts` is likely the **order of operations**. Calling `context.initialize()` *before* registering mocks prevents the DI container from knowing about the mocks when it attempts to resolve `ResolutionService` and its dependency graph. The container needs mocks registered *before* resolution.
*   **Next Step:** Modify `ResolutionService.test.ts` to move `await testContext.initialize();` to *after* all `testContext.registerMock()` calls and immediately before `service = await testContext.resolve...`.

---

**Entry 3:** Widespread Direct Instantiation in Tests
*   Performed grep searches for `new ...Service(`, `new ...Resolver(`, `new ...Factory(` in `*.test.ts` files.
*   **Finding:** Direct instantiation of services, resolvers, and factories using `new` is common throughout the test suite, indicating a systemic inconsistency in DI usage during testing.
*   **Decision:** While acknowledging this broader issue, we will proceed with fixing `ResolutionService.test.ts` using the correct DI pattern (addressing initialization order) to unblock the current refactoring work. The widespread use of `new` in tests will be documented as technical debt for a later, dedicated cleanup effort.
*   **Confirmation:** Verified that production code relies on TSyringe DI, so the test inconsistencies do not reflect production usage.
*   **Next Step:** Apply the fix identified in Entry 2: Modify `ResolutionService.test.ts` to move `await testContext.initialize();` to *after* all `testContext.registerMock()` calls and immediately before `service = await testContext.resolve...`.

---

**Entry 4:** Fix Initialization Order & Linter Errors
*   Applied the initialization order fix to `ResolutionService.test.ts`.
*   This revealed numerous type errors related to Phases 1 & 2 refactoring (Variable types, Path types, factory usage).
*   Attempted multiple fixes for subsequent linter errors (type errors, syntax errors), but encountered persistent syntax errors in `expectToThrowWithConfig` blocks.
*   **User Intervention:** User manually fixed the persistent linter errors in `services/resolution/ResolutionService/ResolutionService.test.ts`.
*   **Next Step:** Re-run the tests for `services/resolution/ResolutionService/ResolutionService.test.ts` to verify if the initialization order fix resolves the original `TypeError` failures.

--- 