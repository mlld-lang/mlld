# Phase 6: E2E Tests, Cleanup & Final Review

## Context:
- Overall Architecture: @docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: @docs/dev/PIPELINE.md
- Current AST Structure: @docs/dev/AST.md 
- High-Level Refactoring Plan: @_plans/PLAN-TYPES.md

**Objective:** Validate end-to-end behavior, remove temporary workarounds, update documentation, and finalize the type refactoring effort.

## A. Type Refinement Proposals

No type refinements are expected in this phase. The focus is on validation and cleanup based on the types established in previous phases.

## B. Detailed Implementation Plan

### 1. E2E Test Execution & Fixes

*   **Action:** Execute the full End-to-End (E2E) test suite. Identify and fix any failing tests.
*   **Files/Directories:**
    *   `tests/cases/` (Integration-style tests)
    *   `tests/e2e/` (Broader E2E scenarios)
*   **Details/Considerations:**
    *   Run the test suites using the designated test runner command (e.g., `npm run test:e2e`, `npm run test:cases` or equivalent).
    *   Pay close attention to tests involving complex interactions between directives (`@variable`, `@define`, `@import`, `@run`, `@embed`), as these are most likely affected by the stricter type implementations.
    *   Specifically review any tests recently integrated, such as those from `e2e-fixes-embed`, as they might target edge cases relevant to the refactor.
    *   Document failures clearly before fixing. Fixes should align with the new type system, avoiding temporary workarounds.
*   **Testing:** The action *is* testing. The goal is a 100% pass rate for all tests in `tests/cases/` and `tests/e2e/`.

### 2. Temporary Type Assertion Cleanup

*   **Action:** Systematically search for and remove temporary type assertions (e.g., `as any`, `as unknown`, potentially overly broad `as Type`) introduced during Phases 1-5.
*   **Files/Directories:**
    *   `src/` (Entire codebase)
*   **Details/Considerations:**
    *   Use codebase-wide search tools (e.g., `grep`, IDE search) for patterns like ` as any`, ` as unknown`.
    *   Review each identified assertion:
        *   Is it still necessary? Often, improved types from the refactor will make them redundant.
        *   Can it be replaced with a more specific type assertion?
        *   Can it be removed entirely by refactoring the local logic or adding type guards (e.g., `if (typeof ... === 'string')`)?
    *   Prioritize the removal of `as any` and `as unknown` as they defeat the purpose of the type system.
*   **Testing:**
    *   After removing/refactoring assertions, run the TypeScript compiler check (e.g., `tsc --noEmit` or `npm run typecheck`) to ensure no type errors were introduced.
    *   Run unit tests (e.g., `npm run test:unit`) to catch potential runtime errors masked by the previous assertions.

### 3. Ensure Consistent Error Handling

*   **Action:** Verify that the chosen error handling strategy (e.g., use of `Result<T, E>`, specific error classes, standardized codes) is applied consistently across the refactored services.
*   **Files/Directories:** Primarily `services/*` and `core/errors/*`.
*   **Details/Considerations:**
    *   Review how errors are returned or thrown by refactored methods in `StateService`, `PathService`, `ResolutionService`, `FileSystemService`, and directive handlers.
    *   Ensure alignment with the strategy outlined in `PLAN-TYPES.md` (Guiding Principles).
    *   Refactor any inconsistent error handling patterns found.
*   **Testing:** Code review, potentially adding specific unit tests for error paths if coverage is lacking.

### 4. Documentation Update & Review

*   **Action:** Review and update all relevant developer documentation to reflect the state of the codebase after the type refactoring.
*   **Files/Directories:**
    *   `README.md`
    *   `docs/dev/DI-ARCHITECTURE.md`
    *   `docs/dev/PIPELINE.md`
    *   `docs/dev/AST.md`
    *   Any other developer guides or READMEs potentially impacted.
*   **Details/Considerations:**
    *   Ensure `AST.md` accurately describes the final Abstract Syntax Tree structure.
    *   Verify diagrams and descriptions in `PIPELINE.md` and `DI-ARCHITECTURE.md` correctly represent the data flow and service interactions with the new types.
    *   Update `README.md` or other guides if setup, contribution, or usage instructions have changed.
    *   Check for consistency in terminology and concepts across all documentation.
*   **Testing:** Manual review by team members to ensure accuracy, clarity, and completeness.

### 5. Final Code Review & Sanity Checks

*   **Action:** Conduct a final pass over the codebase changes related to the type refactoring (Phases 1-6) and perform manual sanity checks.
*   **Files/Directories:**
    *   Review Pull Requests associated with Phases 1-5.
    *   Focus on core areas: `src/pipelines/`, `src/directives/`, `src/common/types/`.
*   **Details/Considerations:**
    *   Look for any remaining `TODO` comments related to the refactor.
    *   Check for potential logical errors or edge cases that might have been missed during automated testing.
    *   Manually run the application with a few representative `.mld` files or common use cases to ensure core functionality works as expected.
*   **Testing:** Code review discussions, manual testing of primary user workflows. 