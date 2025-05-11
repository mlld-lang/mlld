# Plan: AST Snapshot Testing Suite

## Goal

Create a robust, automated snapshot testing suite for the Meld Abstract Syntax Tree (AST) parser (`@core/ast`). This suite will serve as both a regression test for the parser and a clear reference for the expected AST structure for various Meld syntax examples.

## Location

- Create a new test file: `core/ast/tests/ast-snapshot.test.ts`

## Tooling

- Utilize Vitest's built-in snapshot testing capabilities (`expect(...).toMatchSnapshot()`).

## Test Cases

Organize tests using `describe` blocks for clarity:

1.  **Variable References:**
    *   Include all samples from `_dev/scripts/debug/ast-diagnostics.mjs` (`variableSamples`).
    *   Add cases for different levels of nesting and complexity.
    *   Test edge cases like empty braces `{{}}`, invalid identifiers `{{?}}`, etc.
2.  **Directives (Grouped by Kind):**
    *   Include all samples from `_dev/scripts/debug/ast-diagnostics.mjs` (`directiveSamples`).
    *   **Text:** Basic, with quotes, with variable interpolation.
    *   **Data:** Basic object, basic array, object with variable interpolation, array with variable interpolation, nested structures.
    *   **Path:** Basic, with variables (`$PROJECTPATH`, `$HOMEPATH`), with interpolation `{{var}}`.
    *   **Import:** Basic, path variables, array syntax.
    *   **Define:** Basic command, complex command.
    *   **Embed:** Basic path, path variable, section identifier.
    *   **Run:** Basic command string.
3.  **Syntax Edge Cases:**
    *   Empty input string.
    *   Input with only whitespace/newlines.
    *   Malformed directives (e.g., `@text no_equals`).
    *   Unclosed variable braces (`Hello {{name`).
    *   Code fences.
    *   Plain text mixed with directives/variables.

## Implementation Steps

1.  **Create File:** Create `core/ast/tests/ast-snapshot.test.ts`.
2.  **Imports:** Import `describe`, `it`, `expect` from Vitest and the `parse` function from `@core/ast` (using the correct alias or relative path).
3.  **Parser Options:** Define a standard set of parser options to use for consistency (e.g., `{ trackLocations: true, validateNodes: true, structuredPaths: true }`).
4.  **Write Tests:** For each test case/snippet:
    *   Create an `it(...)` block with a descriptive name.
    *   Define the input `snippet` string.
    *   Call `const result = await parse(snippet, options);` within the test.
    *   Assert using `expect(result.ast).toMatchSnapshot();`.
5.  **Initial Snapshot Generation:** Run `npx vitest -u core/ast/tests/ast-snapshot.test.ts` (or similar command targeting the file) to generate the initial `.snap` file.
6.  **Review Snapshot:** Carefully review the contents of `core/ast/tests/ast-snapshot.test.ts.snap` to verify that the initial AST structures captured are correct and match expectations.
7.  **Commit:** Commit both the test file and the generated snapshot file.

## Maintenance

- When the parser logic is intentionally changed, update the snapshots by running `vitest -u ...`.
- Carefully review snapshot diffs during code reviews to catch unintended parser regressions.

## Benefits

- Automated detection of regressions in the parser.
- Clear, version-controlled documentation of expected AST structures.
- Simplifies debugging parser issues by providing a baseline. 