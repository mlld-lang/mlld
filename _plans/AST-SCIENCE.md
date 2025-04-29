# AST Science Notebook

This notebook documents investigations into the Meld grammar parsing behavior, particularly focusing on issues identified through test failures.

## Issue 1: Path Variable Parsing in Directives (`@import`, `@embed`)

**Symptoms:**
*   Tests in `core/ast/tests/directives/path-variable-import.test.ts` and `core/ast/tests/directives/path-variable-embed.test.ts` fail when paths combine path variables (`$var`), text variables (`{{var}}`), literals, separators, and section identifiers.
*   The parser incorrectly produces `Text` nodes instead of the expected structured sequence of `VariableReference`, `Literal`, `PathSeparator`, `SectionIdentifier` nodes.

**Hypothesis:** The `PathValue` rule (and its sub-rules like `PathSegment`, `InterpolatedPathSegment`) in `meld.pegjs` doesn't correctly handle the combination of different element types within a single path string, potentially prioritizing simple text matching over structured parsing when variables are present.

**Investigation Steps:**
1.  Add debug logging to relevant `meld.pegjs` rules: `PathValue`, `PathSegment`, `InterpolatedPathSegment`, `PathVariableName`, `LiteralPathSegment`, `BracketInterpolatableContent`. Use tags like `PATH`, `SEGMENT`, `INTERPOLATE`, `VAR`.
2.  Run `npm run build:grammar && npm test core/ast`.
3.  Analyze debug output for failing tests (e.g., `@import "[$file_path]/subdirectory.md#section"`).
4.  Document observations below.

**Observations (Initial - Pre-Debugging):**
*   The failures consistently show that the segment containing the variable and surrounding literals/separators is not being broken down. For example, `[$file_path]/sub` might be parsed as a single text element instead of `$file_path`, `/`, and `sub`.

**Investigation Log:**

1.  **Initial Logging (`PathValue = ...InterpolatedStringLiteral`):** Added `console.log` to this rule. Log message did *not* appear for bracketed paths (`[...]`) in failing tests, indicating this rule definition isn't responsible for parsing bracketed directive arguments.
2.  **Targeted Logging (`BracketInterpolatableContent`, `ImportInterpolatablePath`):** Added `console.log` inside the action blocks of these rules to inspect the `parts` array they collect.
    *   **Observation:** When a path starts with a variable (e.g., `$file_path`), it is correctly parsed as a `VariableReference` node.
    *   **Observation:** However, *all* subsequent characters within the brackets (including separators `/`, `.`, section markers `#`, and even other variables like `{{text_var}}`) are parsed as a single, subsequent `Text` node (e.g., `"/subdirectory.md"`, `"#section"`, `"/{{text_var}}.md#section"`).
    *   **Conclusion:** The issue lies in how the sequence *after* an initial variable is parsed. The grammar rules responsible for parsing segments within brackets (`BracketPart`, `ImportPathPart`) seem to default to a generic 'literal text' match after encountering a variable, instead of continuing to parse for specific separators, literals, or other variables.

**Hypothesis:** The `BracketPart` / `ImportPathPart` rules use an alternative like `Variable / LiteralTextSegment`. After matching `Variable`, the `LiteralTextSegment` rule greedily consumes all remaining characters until `]` because its definition (`AllowedChar+`) doesn't explicitly recognize or stop at path separators, section identifiers, or other variable types.

**Next Steps:** Add logging *inside* `BracketPart` and `ImportPathPart` to see which alternative (`Variable` or `LiteralTextSegment`) matches each segment of the input string within the brackets.

**Investigation Log (Continued):**

3.  **Detailed Logging (`BracketPart`, `ImportPathPart` alternatives):** Added `console.log` inside the action blocks for *both* the `Variable` and the `...LiteralTextSegment` alternatives within `BracketPart` and `ImportPathPart`.
    *   **Observation (e.g., `@import [$file_path/sub]`):** 
        1.  The `Variable` alternative correctly matches `$file_path`.
        2.  The `...LiteralTextSegment` alternative then matches the *entire* remaining string (e.g., `"/sub"`) as a single segment.
    *   **Observation (e.g., `@embed [$file_path/{{text_var}}.md#section]`):
        1.  The `Variable` alternative correctly matches `$file_path`.
        2.  The `BracketLiteralTextSegment` alternative matches the *entire* remaining string (`"/{{text_var}}.md#section"`) as a single segment.
    *   **Conclusion Confirmed:** The hypothesis is correct. The grammar first identifies the variable using the `Variable` rule. Subsequently, the parser attempts to match the next part. Since characters like `/`, `.`, `#`, `{` are allowed by `...AllowedLiteralChar`, the `...LiteralTextSegment` alternative successfully matches and consumes *all* remaining characters up to the closing `]`. It lacks rules to specifically identify path separators, section markers, or nested variables within this context.

**Root Cause:** The grammar rules for parsing bracketed content (`BracketPart`, `ImportPathPart`) are too simplistic. They need to be able to parse a *sequence* of different component types (Variable, Literal, Separator, Section Marker) rather than just choosing between matching *one* Variable or *one* monolithic LiteralTextSegment.

**Proposed Fix Strategy:** Modify the grammar to define specific tokens for path components (e.g., `PathSeparator`, `SectionMarker`, `DotSeparator`) and update `BracketPart`/`ImportPathPart` (or introduce a new intermediate rule) to parse a sequence (`+`) of these specific tokens along with `Variable` and `LiteralTextSegment` (which would need to be adjusted to *not* consume the new specific tokens).

4.  **Refactoring and Debugging `valueType` (`@embed` specifically):** After implementing the fix strategy from step 3 by refactoring `BracketInterpolatableContentOrEmpty` to return a structured array `content` (containing `VariableReference`, `Text`, `PathSeparator` nodes), the tests still failed for mixed variable types (e.g., `@embed [$file_path/{{text_var}}.md]`).
    *   **Refactoring:** Modified `_EmbedRHS` (bracketed alternative) to directly use the `content` array from `BracketInterpolatableContentOrEmpty`, removing calls to the problematic `validatePath`. It now calculates flags by iterating `content` and uses `reconstructRawString(content)` to generate the `raw` path property.
    *   **Debug Implementation:** Fixed the placeholder `helpers.debug` function in the grammar initializer block to use `process.stdout.write` based on `core/ast/docs/DEBUG.md`.
    *   **Logging Added:**
        *   `CreateVAR` logs in `TextVar`, `DataVar`, `PathVar` rules.
        *   `RawStringVAR` log inside `reconstructRawString` when processing a `VariableReference` node.
    *   **Observation (e.g., `@embed [$file_path/{{text_var}}.md]`):**
        1.  `CreateVAR` log for `file_path` shows `valueType: 'path'` (Correct).
        2.  `CreateVAR` log for `text_var` shows `valueType: 'text'` (Correct).
        3.  `RawStringVAR` log inside `reconstructRawString` for `file_path` shows `valueType: 'path'` (Correct).
        4.  `RawStringVAR` log inside `reconstructRawString` for `text_var` shows `valueType: 'path'` (**INCORRECT!**).
    *   **Conclusion:** The initial parsing via `BracketInterpolatableContentOrEmpty` and the `TextVar`/`PathVar` rules correctly assigns `valueType`. However, by the time the `VariableReference` node for `text_var` is processed *within* the `reconstructRawString` function (when called by `_EmbedRHS`), its `valueType` has changed from `text` to `path`. This causes `reconstructRawString` to format it as `$text_var` instead of `{{text_var}}`.
    *   **Hypothesis:** The `reconstructRawString` function might be unintentionally *mutating* the `valueType` property of the nodes within the `content` array it receives.
    *   **Next Step:** Add debug logging in `_EmbedRHS` to inspect the `valueType` of nodes in the `content` array *immediately* after it is returned by `BracketInterpolatableContentOrEmpty` but *before* it is passed to `reconstructRawString`.
    *   **Further Debugging (Step 4b):**
        1.  Added `EmbedRHS_Content_Pre` log in `_EmbedRHS` rule.
        2.  **Observation:** This log confirmed that the `content` array *correctly* holds `valueType: 'text'` for the `text_var` node *before* `reconstructRawString` is called.
        3.  **Contradiction:** The existing `RawStringVAR` log *inside* `reconstructRawString` still showed `valueType: 'path'` for the same `text_var` node.
        4.  **Conclusion:** The `valueType` mutation occurs *between* the `EmbedRHS_Content_Pre` log and the `RawStringVAR` log within `reconstructRawString`.
        5.  **Code Review:** Reviewed the `reconstructRawString` function source code. Found no lines that *assign* a new value to `node.valueType`. It only *reads* the property into a local variable.
        6.  **Revised Conclusion:** The mutation is *not* happening directly within `reconstructRawString` as initially suspected. The node's `valueType` must be changing due to some other mechanism acting on the object reference between these two log points.
        7.  **Next Step Planned (but cancelled):** Add a log *immediately* before the `valueType` is read within the `reconstructRawString` loop to confirm the exact state at that moment.
    *   **Further Debugging (Step 4c):**
        1.  Added `RawStringVAR_PreRead` log inside `reconstructRawString`'s loop, just *before* `node.valueType` is read (line 262).
        2.  **Observation:** For `text_var`, this new log showed `valueType: 'path'`. This directly contradicts the `EmbedRHS_Content_Pre` log (which showed `text`) but matches the existing `RawStringVAR` log.
        3.  **Conclusion:** This confirms the `text_var` node's `valueType` is indeed `path` by the time the loop iteration reaches it. The change happens *during* the processing of preceding nodes in the `pathParts` array within the *same* call to `reconstructRawString`.
        4.  **Deepening Mystery:** The code within the `reconstructRawString` loop still shows no mechanism for mutating the `node.valueType` of *other* nodes in the array being iterated.
        5.  **Next Hypothesis:** Could the `helpers.debug` function itself, or some underlying JavaScript/PeggyJS object reference behavior, be causing this mutation when processing earlier nodes in the loop?
        6.  **Next Step:** Temporarily remove *all* `helpers.debug` calls from within the `reconstructRawString` function to see if the test failure changes, ruling out logging interference.
    *   **Further Debugging (Step 4d):**
        1.  Commented out `RawStringVAR_PreRead` and `RawStringVAR` logs within `reconstructRawString`.
        2.  Ran the test again.
        3.  **Observation:** The test failed in the exact same way (expected `$file_path/{{text_var}}.md`, received `$file_path/$text_var.md`).
        4.  **Conclusion:** The `helpers.debug` calls within `reconstructRawString` were **not** the cause of the `valueType` mutation.
        5.  **Refined Hypothesis:** The mutation must be occurring due to shared object references. The `text_var` node object, referenced within the `pathParts` array, is being modified somehow during the processing of *earlier* nodes in the `reconstructRawString` loop, likely through an unexpected side effect or property access that affects the shared object.
        6.  **Next Step:** Introduce a deep copy (`JSON.parse(JSON.stringify())`) of the `pathParts` array *before* passing it to `reconstructRawString` in the `_EmbedRHS` rule. This should isolate the function call and prevent modifications to the original node objects via shared references.
    *   **Further Debugging (Step 4e):**
        1.  Reviewed `reconstructRawString` again; confirmed it only *reads* properties, no assignments.
        2.  Reviewed `_EmbedRHS` between `content` parsing (line 522) and flag calculation (lines 539-540). The only operation on `pathParts` is the call to `reconstructRawString`.
        3.  Removed temporary `helpers.debug` calls from `reconstructRawString` and confirmed the test failure persisted, ruling out logging interference.
        4.  **Conclusion:** The `valueType` flip must be happening *before* the flag calculation on lines 539-540, but the exact mechanism is unclear. The `EMBED_RHS_PRE_FLAGS` log should show the state, but might be getting truncated. It's confirmed not happening *in* `reconstructRawString` directly.
        5.  **Next Step:** Add a targeted debug log *within* the `.some()` callback for `hasPathVariables` (line 540) to inspect the node's `valueType` at the exact moment the check is performed.

## Issue 2: Variable Syntax Warning Flag

**Symptoms:**
*   Test `should add variable_warning flag for paths with text variables only` in `core/ast/tests/directives/variable-syntax.test.ts` fails. It expects `path_contains_only_text_variables` to be `false` but receives `true`.

**Hypothesis:** The logic within the grammar's action code (likely in the `PathValue` rule or the directive rules themselves) that sets the `path_contains_only_text_variables` flag is incorrectly evaluating the path contents. It might be misidentifying paths containing `$path_vars` as text-only, or the flag's logic is flawed.

**Investigation Steps:**
1.  Examine the action code in `meld.pegjs` where `path_contains_only_text_variables` is calculated and set.
2.  Add specific debug logs around this calculation.
3.  Run tests and analyze the logs for the failing test case (`@import "{{text_var}}.md"`).
4.  Document observations below.

**Observations (Initial - Pre-Debugging):**
*   The test case failing uses `@import "{{text_var}}.md"`. This *should* be flagged as `true` according to the flag's name. This suggests either the test expectation is wrong, or the flag's name/purpose is misleading, or there's a subtle interaction we're missing. *Correction:* Reviewing the test description: "should add variable\_warning flag for paths with text variables **only**" implies the flag should be true *if and only if* text variables are present, and *no other* variable types (like `$path_vars`) are present. The failing test might be constructing a path that *looks* text-only but is parsed differently, or the test setup is incorrect. Let's re-examine the failing test setup specifically.

**Observations (Post-Debugging):**
*   *(To be filled in after running tests with debugging)*

## Experiment Log: Bracket Path Parsing & ValueType

**Date:** 2025-04-26

**Goal:** Address greedy bracket path parsing (Issue #1), valueType mutation (Issue #2), and variable_warning flag (Issue #3).

**Hypothesis 1:** Tightening `BracketAllowedLiteralChar` and `ImportPathAllowedLiteralChar` will prevent greedy consumption of separators/variables.

*   **Action:** Modified rules in [meld.pegjs](cci:7://file:///Users/adam/dev/meld/core/ast/grammar/meld.pegjs:0:0-0:0) to disallow `/.#{}`, `{{`, `$`, `\\`. Added `Object.freeze` to `createVariableReferenceNode` to catch mutations.
*   **Observation (Run 1):** Test failures increased (17 files, 74 tests). Literals captured with extraneous commas (e.g., `",H,e,l,l,o"`). No `Object.freeze` error thrown. Greedy parsing *tokenization* improved, but literal aggregation was broken.

**Hypothesis 2:** Using `$()` capture in literal segment rules will fix the comma issue.

*   **Action:** Modified `*LiteralTextSegment` rules in [meld.pegjs](cci:7://file:///Users/adam/dev/meld/core/ast/grammar/meld.pegjs:0:0-0:0) to use `value:$(...)` instead of `chars:(...)+ { ... .join('') }`.
*   **Observation (Run 2):** Test failures reduced slightly (16 files, 63 tests). Comma issue fixed; literals captured correctly. No `Object.freeze` error thrown. Exposed downstream issues:
    *   `@run` directive test failed: Input `echo {{message}}` now correctly parsed as `Text("echo ")` + `VariableReference("{{message}}")`. The directive handling logic needs update.
    *   `variable_warning` flag issues persist. Logic in `validatePath` for detecting variable types (especially `hasPathVariables` with leading separators) needs review.
    *   Raw path string in `validatePath` result seems incorrect for paths containing only text variables (`$text_variable.md` vs expected `{{text_variable}}.md`).

**Conclusions & Next Steps:**

1.  The stricter literal character classes combined with `$()` capture are the correct approach for parsing literal segments.
2.  The `valueType` mutation (Issue #2) seems resolved or masked. Remove `Object.freeze` (Done in next step).
3.  Focus on fixing the helper functions/rules that consume the parsed path/directive bodies:
    *   Update `RunDirectiveBody` / `validateRunDirective` to handle sequences of Text and Variable nodes.
    *   Revise `validatePath` logic for `hasPathVariables` / `hasTextVariables` flags, ensuring it checks all path segments.
    *   Investigate/fix raw path reconstruction in `validatePath` for text variables.
