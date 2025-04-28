# Plan: Refactor AST Directive Tests for Clarity and Reliability

## Problem

Some AST tests located in `core/ast/tests/directives/` contain logic that modifies the imported test fixtures (`@core/syntax/types/fixtures/...`) before running assertions. This practice has several drawbacks:

*   **Obscures Expected Output:** The true expected AST structure is not solely defined in the fixture, making tests harder to understand and verify.
*   **Maintenance Burden:** Changes to the required AST might necessitate updates in both the fixture and the test file's modification logic.
*   **Potential for Bugs:** The modification logic itself can introduce errors, leading to tests passing or failing incorrectly (as seen in the original `import.test.ts`).
*   **Redundant Boilerplate:** Many simple tests repeat the pattern of importing fixtures and looping through them.

This pattern is undesirable and can mask issues, potentially stemming from attempts to quickly make tests pass without ensuring the underlying fixture accuracy (a form of 'reward hacking').

## Desired Pattern

1.  **Single Source of Truth:** Test fixtures defined in `core/syntax/types/fixtures/` should be the *complete and authoritative* source for expected AST structures for any given input.
2.  **Direct Fixture Usage:** AST tests should import these fixtures and use them *directly* with testing utilities (like `testValidCase`, `testInvalidCase`) or direct assertions, without any intermediate modification logic.
3.  **Simplicity:** Test files for simple, fixture-driven cases should primarily consist of imports, `describe`/`it` blocks, and loops that pass fixtures to assertion utilities.

**Example:** The refactoring of `core/ast/tests/directives/import.test.ts` demonstrates this pattern. The complex `.map()` and `switch` statement were removed, and the test now directly iterates over `importTests` from the fixture file.

## Action Plan

1.  **Audit:** Review all test files within `core/ast/tests/directives/`.
    *   Identify any tests that modify imported fixtures before assertion.
    *   Identify tests performing complex inline assertions instead of using fixtures.
2.  **Refactor:** For each identified test:
    *   Ensure the corresponding fixture(s) in `core/syntax/types/fixtures/` accurately and completely represent the expected AST output.
    *   Remove any fixture modification logic from the test file.
    *   Simplify the test file to directly use the corrected fixtures with `testValidCase`/`testInvalidCase` or clear, direct assertions against the fixture's `expected` value.
3.  **Consolidate (Optional but Recommended):** Evaluate if multiple, simple, fixture-driven directive tests (like the refactored `import.test.ts`) can be consolidated into fewer test files (e.g., one file per directive or one file for several simple directives). This reduces boilerplate and reinforces the pattern.
    *   *Decision Point:* Determine the best grouping strategy (e.g., `directives.test.ts`, or `simple-directives.test.ts`).

## Goal

Improve the clarity, reliability, and maintainability of the AST directive tests by ensuring fixtures are the single source of truth and test logic is straightforward.

## Future Improvements

- Standardize test assertion style: Some tests (e.g., in `parser.test.ts`) use multiple individual `expect()` calls to verify node properties, while others (e.g., directive-specific tests) use `expect(actual).toEqual(expectedFixture)`. Consider consolidating to the fixture-based approach for consistency.
- Consolidate test file structure: Move directive-specific tests currently in `parser.test.ts` (e.g., `@path`) into dedicated files under `core/ast/tests/directives/`.
- Standardize invalid case handling: Use the `testInvalidCase` utility and corresponding `xxxInvalidTests` fixtures consistently for testing invalid syntax, rather than inline `expect().rejects.toThrow()`.
