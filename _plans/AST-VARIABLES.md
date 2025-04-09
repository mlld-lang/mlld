# Plan: Context-Aware Variable Parsing in AST

## Goal

Refactor the `@core/ast` parser to be context-aware regarding variable interpolation syntax (`{{...}}`, `$var`). The parser should generate an AST that accurately reflects whether variable syntax represents a reference needing resolution or literal text, based on Meld's language rules.

## Problem Statement

Currently, the parser (`@core/ast/grammar/meld.pegjs`) incorrectly parses variable syntax (`{{...}}` or `$identifier`) as `VariableReferenceNode` even in plain text contexts (outside of directives). This forces downstream services (`ResolutionService`, directive handlers) to:

1.  **Re-parse** strings during the resolution phase to find potential variables.
2.  **Carry context** about the string's origin to determine *if* interpolation should even occur (since `{{...}}` in plain text should be literal).
3.  **Risk inconsistency** if the secondary parsing logic differs from the main parser.

This violates the principle of the AST fully representing the parsed structure, pushes syntactic concerns into the semantic resolution phase, and increases complexity and fragility.

## Implementation Challenges & Lessons Learned (First Attempt)

During the initial implementation attempt, several challenges arose, primarily related to modifying the PEG.js grammar:

1.  **Recursive Parsing Issues:** An approach using a helper function (`parseInterpolated`) within grammar action blocks to recursively call the main `parser.parse` function proved problematic. It initially failed with `parse is not defined` errors, requiring the `parser` instance to be passed explicitly. Even then, it subsequently failed with `Can't start parsing from rule "..."` errors, indicating limitations or complexities in using non-default start rules during an active parse, even if the rule was listed in `allowedStartRules` during parser generation. **Conclusion: Avoid recursive calls to `parser.parse` within the grammar.**
2.  **Build Script Sensitivity:** The build script (`build-grammar.mjs`) uses `peggy.generate` for validation with `allowedStartRules`. Incorrectly listing rules here (or potential Peggy bugs related to rule registration visibility) caused build failures unrelated to the main parsing logic. The `allowedStartRules` should generally only contain the primary `Start` rule.
3.  **Fragile Editing & Build Errors:** Sequential edits to the large grammar file proved extremely error-prone.
    *   Accidental deletion of core rules (`_`, `__`, `Comment`, `EOF`, etc.) or misplaced rule definitions caused build failures.
    *   Large-scale commenting/uncommenting or moving large blocks often led to subtle syntax errors (like missing `=` after rule names, missing newlines/semicolons after action blocks `}`) that were hard to spot.
    *   PEG.js build errors can be misleading. For instance, `Rule "X" is not defined` often means `X` is referenced *before* its definition is complete *in file order*, or that a syntax error *within* `X`'s definition prevented it from being registered correctly. `Expected "Y" but found "Z"` often points to a syntax error in the rule *preceding* the error location. `Possible infinite loop` indicates a repetition (`*` or `+`) uses a rule that might match zero characters.

**Key Lesson:** Modifying PEG.js grammars requires extreme care and understanding of its top-down processing. **Small, atomic changes, frequent `build:grammar` checks, and careful attention to rule order are paramount.**

## Critical Lesson: PEG.js Grammar Structure & Rule Order

Our debugging revealed that the **order of rule definitions** in the `.pegjs` file is critical for successful builds, even more so than typically expected. Peggy processes the grammar file top-down. While forward references are sometimes allowed, relying on them heavily, especially across complex rule interactions (like lookaheads), proved fragile.

**Recommended Stable Structure:** Adhere strictly to the following definition order within `meld.pegjs`:

1.  **Initial `{...}` Block:** Contains all JavaScript helper functions (`debug`, `isLineStart`, `validatePath`, `combineAdjacentTextNodes`, etc.) and constants (`NodeType`, `DirectiveKind`).
2.  **Core Data Structure / Complex Parsing Rules:** Define rules that parse significant, structured parts of the language. This includes:
    *   `Variable`, `TextVar`, `DataVar`, `PathVar`, `FieldAccess`, `ArrayAccess`, etc.
    *   Interpolation logic: `DoubleQuoteAllowedLiteralChar`, `DoubleQuoteLiteralTextSegment`, `DoubleQuoteInterpolatableContent`, `DoubleQuoteInterpolatableContentOrEmpty` (and variants for single quotes, backticks, multiline).
    *   `InterpolatedStringLiteral`, `InterpolatedMultilineTemplate`.
    *   **Main `Directive` Rule:** The top-level rule that chooses between specific directives (`= &{...} "@" directive:(ImportDirective / EmbedDirective / ...)`).
    *   **Specific Directive Rules:** `ImportDirective`, `EmbedDirective`, `RunDirective`, `DefineDirective`, `DataDirective`, `TextDirective`, `PathDirective`, `VarDirective`, and any rules used *only* within these specific directives (e.g., `ImportsList`, `DefineParams`, `PropertyValue`, `RunVariableParams`).
    *   `CodeFence`, `BacktickSequence`, `CodeFenceLangID`.
    *   Any other complex, non-terminal rules.
3.  **Layout / Text Flow Rules:** Define rules that manage the flow between the complex structures above.
    *   `Comment`, `LineStartComment`.
    *   `TextBlock`, `TextPart`. **Crucially**, `TextPart` must use lookaheads (`!Directive`, `!CodeFence`, `!Comment`, etc.) to avoid consuming the start of higher-precedence rules defined earlier. Ensure `TextPart` always consumes at least one character to prevent infinite loops in `TextBlock`.
4.  **Main Entry Point:**
    *   `Start`. This rule references the layout/complex rules defined above (`= nodes:(LineStartComment / Comment / CodeFence / Directive / TextBlock)* EOF`).
5.  **Fundamental / "Terminal" Rules:** Define the basic building blocks.
    *   `Identifier`, `StringLiteral`, `NumberLiteral`, `BooleanLiteral`, `NullLiteral`, `MultilineTemplateLiteral` (raw version if needed).
    *   Character-level helpers: `DoubleQuotedChars`, `SingleQuotedChars`, `BacktickQuotedChars`, `TextUntilNewline`, `TextUntilNewlineOrEmpty`.
6.  **Whitespace & EOF Rules:**
    *   `_`, `__`.
    *   `EOF`, `LineTerminator`.

**Rationale:** This order ensures that when Peggy processes any rule (like `Start` or `TextPart`), all other non-terminal rules it references (or uses in lookaheads) have already been fully defined and registered by the parser generator. Fundamental/terminal rules are defined last as they don't typically depend on complex rules. Adhering to this structure dramatically reduces "Rule not defined" build errors.

## Revised Implementation Strategy (Second Attempt)

Based on the lessons learned, we will proceed with the **inline, delimiter-specific parsing strategy** for handling interpolation within directive values.

**1. Detailed `meld.pegjs` Modification Strategy (Inline Approach):**

*   **Adhere to Strict Rule Order:** (NEW) Implement all grammar changes following the **Critical Lesson: PEG.js Grammar Structure & Rule Order** section above. Place new rules and modify existing rules according to that structure.
*   **Top-Level Parsing:** (REVISED)
    *   Remove the old `TopLevelNode`, `TopLevelTextBlock`, and `TopLevelTextPart` concepts.
    *   Define the main entry point `Start` *after* complex/layout rules but *before* fundamentals/whitespace: `Start = nodes:(LineStartComment / Comment / CodeFence / Directive / TextBlock)* EOF { return nodes.filter(n => n !== null); }`. This order dictates parsing precedence.
    *   Define `TextBlock` and `TextPart` just before `Start`. `TextBlock = content:TextPart+ { ... }`.
    *   Define `TextPart` to use lookaheads to avoid consuming higher-precedence elements and ensure it always consumes one character:
        ```pegjs
        TextPart "part of a text block"
          = ( // Group lookaheads
              !Directive          // Check full rules if defined before TextPart
              !CodeFence
              !LineStartComment
              !Comment
              // Add other top-level lookaheads if needed
            )
            char:. // Consume one character MANDATORY
            { return text(); }
        ```
    *   This approach treats any line not starting with `@`, ``` ` ```, `>>`, `/*` etc. as plain text within a `TextBlock` -> `TextNode`. Variable syntax (`{{...}}`, `$var`) within these blocks will be treated as literal text.
*   **Core Rule Preservation:** Ensure essential rules (`_`, `__`, `EOF`, `Identifier`, `StringLiteral` etc.) are correctly placed according to the structure (likely in Fundamentals or Whitespace/EOF sections) and are never accidentally deleted. Perform edits atomically, build and run tests frequently.
*   **Delimiter-Specific Interpolation Rules:** (Minor Update)
    *   Define these rules (`XxxAllowedLiteralChar`, `XxxLiteralTextSegment`, `XxxInterpolatableContent`, `XxxInterpolatableContentOrEmpty`) within the "Core Data Structure / Complex Parsing Rules" section.
    *   (Keep existing example)
*   **Update Literal/Template Parsing Rules:** (REVISED)
    *   Define `InterpolatedStringLiteral` and `InterpolatedMultilineTemplate` in the "Core Data Structure / Complex Parsing Rules" section.
    *   These rules should **directly** embed the `XxxInterpolatableContentOrEmpty` rules to parse their content. Do **not** use the `parseInterpolated` helper.
    *   These rules should return the `InterpolatableValue` array directly (e.g., `[ TextNode(...), VariableReferenceNode(...) ]`).
    *   Example (`InterpolatedStringLiteral`):
        ```pegjs
        InterpolatedStringLiteral "String literal with potential variable interpolation"
          = '"' content:DoubleQuoteInterpolatableContentOrEmpty '"' { return content; }
          / "'" content:SingleQuoteInterpolatableContentOrEmpty "'" { return content; }
          / "`" content:BacktickInterpolatableContentOrEmpty "`" { return content; }
        ```
    *   Example (`InterpolatedMultilineTemplate`):
        ```pegjs
        InterpolatedMultilineTemplate "Multiline template with potential variable interpolation"
          = "[[" content:MultilineInterpolatableContentOrEmpty "]]" { return content; }
        ```
*   **Update Directive Value Rules:** (Minor Update) Modify rules like `TextValue`, `PropertyValue` (for `@data`), `DefineValue` to use `InterpolatedStringLiteral` or `InterpolatedMultilineTemplate` where they previously used `StringLiteral` or `MultilineTemplateLiteral`. These rules will now receive an `InterpolatableValue` array.
*   **Path Handling:** (Minor Update) Modify `PathDirective`'s right-hand side (`rhs`) to accept `InterpolatedStringLiteral` or `PathVar`.
    *   If `rhs` is `InterpolatedStringLiteral` (which now returns an `InterpolatableValue` array): Use a *separate* rule or capture mechanism (like the `{raw, interpolated}` object approach *specifically for paths if needed*) to get the **raw** string for `validatePath`. Store the returned `InterpolatableValue` array in the `interpolatedValue` property of the path object.
    *   If `rhs` is `PathVar`, proceed as before.
*   **Helper Functions:** Keep JS helpers (`combineAdjacentTextNodes`, `validatePath`, etc.) in the top `{}` block. **Remove the `parseInterpolated` helper.**

**2. AST Type Updates (`@core/types/`, `@core/syntax/types/`)**

*   **Define `InterpolatableValue`:** (Already Done) Add to `core/types/common.ts`:
    ```typescript
    import type { TextNode, VariableReferenceNode } from '@core/syntax/types/nodes';
    export type InterpolatableValue = (TextNode | VariableReferenceNode)[];
    ```
*   **Define Specific `DirectiveData` Interfaces:** (Already Done) Create `core/syntax/types/directives.ts` with specific interfaces (`TextDirectiveData`, `EmbedDirectiveData`, etc.) using `InterpolatableValue` for relevant properties.
*   **Update `StructuredPath`:** (Already Done) Modify `StructuredPath` in `core/syntax/types/nodes.ts` to include `interpolatedValue?: InterpolatableValue`.

**3. AST Test Update Strategy (`meld-spec`, `*.test.ts`)**

*   **Role of Tests:** Primary validation mechanism. Failures are expected and guide implementation.
*   **Plain Text Tests:** Update tests for inputs *outside* directives (e.g., `{{var}}`, `Hello {{var}}`, `$path`) to assert they produce a single `TextNode` with the literal content.
*   **Directive Interpolation Tests:**
    *   Add *new* test cases for each directive type where interpolation is now supported (text literals, multiline templates, paths, commands).
    *   Assert that the relevant property (e.g., `value`, `command`, `path.interpolatedValue`) contains the correct `InterpolatableValue` array structure (`[ TextNode(...), VariableReferenceNode(...), TextNode(...) ]`).
    *   Cover edge cases: adjacent variables, start/end of string variables, empty content, content with only variables.
*   **Existing Literal Tests:** Update tests that previously asserted simple string values for directives to now expect an `InterpolatableValue` array containing a single `TextNode`.
*   **Rejection Tests:** Review tests that expect parsing to fail (e.g., invalid syntax). Ensure they still fail correctly after the changes.
*   **Debugging Workflow:** Use `npm run build:grammar && npm test core/ast` frequently. Employ `test/debug-test.js` to analyze AST differences.

**4. Downstream Impact Outline (High-Level)**

*   **`ResolutionService`:**
    *   **Input Change:** Core methods processing directive content will receive `InterpolatableValue` arrays instead of raw strings needing re-parsing.
    *   **Logic Change:** Implement iteration over the `InterpolatableValue` array. For `TextNode`, append `content`. For `VariableReferenceNode`, resolve the variable using existing mechanisms and append the result.
    *   **Cleanup:** Remove any secondary/fallback `{{...}}` parsing logic.
*   **Directive Handlers (`TextDirectiveHandler`, `DataDirectiveHandler`, etc.):**
    *   **Input Change:** Will receive AST nodes with `InterpolatableValue` arrays for relevant properties.
    *   **Logic Change:** Adapt internal logic. May involve calling updated `ResolutionService` methods or performing the array iteration directly.
*   **Path Resolution Logic:**
    *   **Processing Order:** Path resolution will now first process the `interpolatedValue` array (resolving variables) to construct the target path string *before* applying filesystem/URL validation and resolution steps using services like `PathService`.
*   **General AST Consumers:** Any code directly accessing affected directive node properties (e.g., `node.value` where `value` was previously `string`) must be updated to handle the new `InterpolatableValue` array structure.

**5. Build Script (`build-grammar.mjs`)**

*   Ensure `allowedStartRules` in *all* `peggy.generate` calls contains *only* `['Start']`.

## Implementation Steps (Fourth Attempt - Order Focused)

1.  **Prepare:** Ensure `@_plans/AST-VARIABLES.md` reflects this updated plan. **(DONE)**
2.  **Clean Grammar & Verify Structure:** Start with a known-good version of `meld.pegjs` or carefully **restructure the existing file** to match the **Recommended Stable Structure** outlined above. Place existing rules into their correct sections. **Run `build:grammar`**. Fix any build errors resulting *only* from reordering before proceeding. **(DONE)**
    *   _Note:_ Performed grammar restructuring. Ran build and tests (`npm run build:grammar && npm test core/ast`). All tests passed, confirming the structural integrity after reordering.
3.  **(ATTEMPTED & REVERTED - Ready for Retry)** **Implement Delimiter-Specific Rules:** Add all `XxxAllowedLiteralChar`, `XxxLiteralTextSegment`, `XxxInterpolatableContent`, `XxxInterpolatableContentOrEmpty` rules into the "Complex Parsing" section. **Run `build:grammar`**.
4.  **(ATTEMPTED & REVERTED - Ready for Retry)** **Implement Interpolated Literals:** Add `InterpolatedStringLiteral` and `InterpolatedMultilineTemplate` (returning arrays directly) into the "Complex Parsing" section. **Run `build:grammar`**.
5.  **(ATTEMPTED & REVERTED - Ready for Retry)** **Update Directive Value Rules (One by One):**
    *   Modify `TextValue` to use `Interpolated...` rules. **Run `build:grammar`**.
    *   Modify `PropertyValue` (for `@data`). **Run `build:grammar`**.
    *   Modify `DefineValue`. **Run `build:grammar`**.
    *   Modify `PathDirective` (handle raw vs interpolated carefully). **Run `build:grammar`**.
    *   *(Self-correction: `_EmbedRHS` and `_RunRHS` are complex helpers, not simple value rules. The plan needs to decide if these helpers are still the best approach or if `EmbedDirective`/`RunDirective` should handle their variations directly. For now, assume they stay but need updating)* Modify `_EmbedRHS` and `_RunRHS` to use interpolation logic internally if they process bracketed content. **Run `build:grammar`**.
6.  **(PARTIALLY DONE - Tests Failed as Expected)** **Run Full Tests:** Once the grammar builds cleanly, run `npm test core/ast`. Expect many assertion failures.
7.  **(STARTED - Paused)** **Update Tests Iteratively:**
    *   Fix plain text tests first (expecting `TextNode` from `TextBlock`).
    *   Fix directive tests one by one, updating assertions to expect `InterpolatableValue` arrays where appropriate.
    *   Use `test.only`/`it.only` and `test/debug-test.js` extensively.
8.  **Refactor Downstream Consumers:** (Separate phase/PR).

## Progress Summary (As of 2024-10-27)

We started by implementing Step 2, successfully restructuring the `meld.pegjs` grammar according to the "Recommended Stable Structure". This involved moving rules without changing logic and verifying with builds and tests, which all passed.

We then proceeded through Steps 3, 4, and 5, adding the various interpolation rules (`XxxAllowed...`, `InterpolatedStringLiteral`, etc.) and updating the directive value rules (`TextValue`, `PropertyValue`, `DefineValue`, `PathValue`, `_EmbedRHS`, `_RunRHS`) one by one, running `build:grammar` after each small change to ensure syntactic validity.

Running the full test suite (`npm test core/ast`) after Step 5 revealed the expected large number of failures (initially 44, then 39) due to the AST structure changes (strings becoming `InterpolatableValue` arrays, `path` objects gaining `interpolatedValue`).

We began debugging these failures (Step 7):
1.  **Direct Variable Embed:** Identified and fixed an issue where the logic for `@embed {{var}}` / `@embed $var` in `_EmbedRHS` was missing, causing TypeErrors. Restoring this logic fixed those errors.
2.  **Array Access Syntax:** Found a mismatch where tests expected dot notation (`list.0`) in reconstructed `raw` strings, while the reconstruction logic produced bracket notation (`list[0]`). We decided to align the tests with the current reconstruction behavior (canonical bracket notation) and updated the affected tests in `embed-variable.test.ts`.
3.  **Parse Error with Brackets:** Investigated the parse error for `@embed [path[brackets].md]`. Compared the current bracket-handling rules (`BracketAllowedLiteralChar` etc.) with the previous grammar version. Found that the new interpolation rule incorrectly disallowed literal `[` characters. Corrected `BracketAllowedLiteralChar` to fix the parse error.
4.  **Revert & Stabilize:** Encountered unexpected failures after fixing the bracket parse error, suggesting the interpolation changes might have had wider effects or interactions. To regain a stable baseline, we reverted the changes made in Steps 3, 4, and 5, keeping only the successful grammar restructuring (Step 2) and the fix for the bracket parse error. After reverting and fixing the array access test expectations, all core AST tests passed.

We are now back at a stable state with the grammar restructured and minor issues fixed, ready to re-attempt the implementation of interpolation (Steps 3-7). The careful, iterative approach with frequent builds and tests proved essential in identifying and isolating issues during the process.

## Priority

**High.** This remains a foundational fix for AST accuracy and downstream simplification. The structural refactoring is key to enabling further grammar work reliably. 