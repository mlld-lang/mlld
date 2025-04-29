# AST ISSUES

This document contains two parts: a plan and a list of issues.

## Plan

Modifying the Peggy/PEG.js grammar in `core/ast/grammar/meld.pegjs` is complex due to the file's size and specialized syntax. We will proceed with caution, adhering to the advice in `core/ast/docs/ADVICE.md` and leveraging the debugging tools described in `core/ast/docs/DEBUG.md`.

Our approach involves distinct phases, each focusing on a specific issue identified in the "Issues" section below. Each phase follows a "test-first, investigate-second, instrument-third, plan-fourth, edit-fifth" strategy:

1.  **Test:** Identify and confirm the specific failing test case(s) related to the phase's goal.
2.  **Investigate:** Examine the relevant rules and helper functions in `meld.pegjs` and related test fixtures/utils. Consult `core/ast/docs/peggy.html` for syntax help.
3.  **Instrument:** Add targeted `helpers.debug('CATEGORY')` calls to trace the parser's behavior for the problematic input.
4.  **Plan:** Outline the specific grammar modifications needed based on the investigation and debug logs.
5.  **Edit:** Carefully apply the planned changes to `meld.pegjs`.
6.  **Verify:** Run `npm run build:grammar && npm test core/ast` (or specific test files). Analyze test results and debug logs. Iterate steps 2-6 as needed. Remove or disable debug logs upon success.

---

**Phase 1: `@text [...]` Syntax Support** Complete

---

**Phase 2: `@run $command (...)` Argument Parsing** Complete

---

**Phase 3: Path Variable Interpolation (`$var/{{name}}`)**

*   **Focus:** Enable correct parsing of text variables (`{{name}}`) within path segments that *follow* a path variable (`$var`).
*   **Problem:** The parser incorrectly treats the part of the path after the `$var` as a single literal segment (e.g., `/{{name}}/file`) instead of parsing it into interpolated parts (e.g., `/`, `{{name}}`, `/file`). This affects directives like `@import` and `@embed`. Tests like `core/ast/tests/directives/path-variable-import.test.ts` > `should correctly parse path variables with complex directory structures` fail.
*   **Status:** **In Progress**
*   **Progress & Findings:**
    *   Confirmed the failing test case (`path-variable-embed.test.ts` > combination) shows the parser producing `[VariableReference($file_path), Text(/{{text_var}}.md#section)]` instead of the expected segmented output.
    *   Investigation revealed that `@embed [...]` uses the `BracketInterpolatableContentOrEmpty` rule.
    *   The root cause was identified within the `BracketText` sub-rule used by `BracketInterpolatableContent`. Its definition `chars:$(!InterpolatedVariable !"]" .)+` consumes characters greedily until `]` or the *start* of an `InterpolatedVariable` (`{{` or `$`). It doesn't stop *before* hitting a variable delimiter mid-segment.
    *   **Proposed Fix:** Modify `BracketText` to consume characters one by one, stopping explicitly before `{{`, `$`, or `]`. The proposed rule is `chars:$((!"{{" !"$" !"]") .)+`. This should correctly segment the path string into Text and VariableReference nodes.
*   **Intended I/O:**
    *   Input: `@import [name] from [$path/{{dir}}/file.md]`
    *   Output (Directive): An `ImportDirective` whose `path` property contains `values: [{type: VariableReference, identifier: 'path', valueType: 'path', ...}, {type: Text, content: '/'}, {type: VariableReference, identifier: 'dir', valueType: 'text', ...}, {type: Text, content: '/file.md'}]`.
*   **Steps:**
    1.  **Test:** Confirm failures in `path-variable-import.test.ts` and `path-variable-embed.test.ts` related to this pattern. (Confirmed)
    2.  **Investigate:** Examine rules like `BracketInterpolatableContent`, `BracketText`, `_EmbedRHS`, `ImportDirective`. Focus on how path strings are segmented. (Completed)
    3.  **Instrument:** Add `helpers.debug('PATH', 'INTERPOLATE', 'EMBED')` logs to trace path processing. (Partially done, can be added if needed)
    4.  **Plan:** Modify `BracketText` rule as identified above. (Completed, but held pending other fixes)
    5.  **Edit:** Apply planned change to `meld.pegjs`. (Deferred)
    6.  **Verify:** Run `npm run build:grammar` and the relevant `path-variable-*.test.ts` files.

*   **Status Update (2025-04-26):**
    *   **Progress:**
        *   The `validatePath` function in `meld.pegjs` has been significantly refined: it now correctly builds `structured.segments` based on `/` separators, while also treating `.` as an explicit `PathSeparator` node *within the `values` array* to provide a more granular component breakdown (e.g., for file extensions).
        *   Assertions in `path-variable-import.test.ts` have been updated to match the new, granular `values` structure, resolving several test failures related to path parsing.
    *   **Remaining Issues & Next Steps for Phase 3 (Priority Order):**
        1.  **(High Priority - Logic Bug)** Fix the `raw` value bug: Investigate why `path.raw` becomes `[object Object]` for non-bracketed variable paths (e.g., `@import $file_path`). Check `validatePath` call sites or `helpers.reconstructRawString`. (Affects 2 tests: `path-variable-import.test.ts`, `variable-syntax.test.ts`).
        2.  **(Assertion Updates)** Update assertions in `path-variable-embed.test.ts` to match the refined `validatePath` output structure (top-level flags, granular `values`). (Affects 9 tests).
        3.  **(`@embed` Issue)** Investigate `embed-variable.test.ts` length mismatch (expected 3 nodes, got 2) when embedding a simple variable. Examine the `_EmbedRHS` grammar rule. (Affects 5 tests).
        4.  **(`@import` Issue)** Investigate `named-import.test.ts` `toMatchObject` failures. Analyze detailed diffs to pinpoint the mismatch. (Affects 2 tests).
        5.  **(Original Phase 3 Goal - Lower Priority)** Revisit the `BracketText` rule modification (`chars:$((!"{{" !"$" !"]") .)+`). This was the original plan to fix parsing of mixed variables/text *within bracketed paths* (e.g., `[$path/{{var}}.txt]`) before they reach `validatePath`. This might resolve some underlying issues in `path-variable-embed.test.ts` but should be tackled after the issues above.

---
**Phase 4: Final Test Review & Cleanup**

*   **Focus:** Resolve any remaining test failures after addressing the primary grammar issues.
*   **Goal:** Achieve a fully passing test suite (`npm test core/ast`).
*   **Steps:**
    1.  **Test:** Run the complete `core/ast` test suite: `npm run build:grammar && npm test core/ast`.
    2.  **Analyze Failures:** For any remaining failures, carefully examine the diffs.
    3.  **Fix Expectations:** If the AST produced by the fixed grammar is correct according to the project plan but the test *expectation* is slightly off, update the test fixture or assertion in the relevant `*.test.ts` file.
    4.  **Revisit Phases:** If the AST itself is still incorrect, identify which phase's logic is still flawed and revisit the Investigate/Instrument/Plan/Edit steps for that phase.
    5.  **Iterate:** Repeat until all tests pass.

## Issues

*   **`@text` Directive Syntax Limitation:** The grammar rule `TextDirective` in `core/ast/grammar/meld.pegjs` currently only supports the `@text identifier = value` syntax. It does not recognize or parse the `@text [value]` syntax, causing parser errors for inputs like `@text [Hello, world!]`. (Discovered during test refactoring)
*   **Path Interpolation Failure:** The parser fails to correctly interpolate variables (`{{...}}`) within path segments following a path variable (`$variable`), e.g., in `@embed [$var/{{name}}/file]`. It treats the post-variable part as a single literal text node instead of breaking it into text/variable/text segments. (Discovered during test refactoring)
*   **`@run $command (...)` Argument Failure:** The parser fails to parse arguments provided in parentheses `(...)` for the `@run` directive specifically when the command itself is a variable (`$command`). It results in an empty `args` array in the AST. (Discovered during test refactoring)

---

**Remaining Issues / Next Steps:**

*   The test suite currently shows 47 failures (as of Step ID 309). These seem concentrated in files dealing with path variables and variable embedding (`path-variable-*.test.ts`, `embed-variable.test.ts`).
*   These failures are likely due to the grammar changes impacting how variable/path AST nodes are structured, causing mismatches with existing fixtures.
*   **Next:**
    1.  **(Recommended)** Clean up debug logs added in Phase 2 (`ARGS`, `RUN`/`ARGS` logs in `meld.pegjs`).
    2.  Address remaining test failures, likely by updating fixtures in the failing test files (e.g., start with `path-variable-embed.test.ts`).
