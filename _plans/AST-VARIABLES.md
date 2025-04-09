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

## Implementation Steps (Fourth Attempt - Order Focused - Revised Again)

1.  **Prepare:** Ensure `@_plans/AST-VARIABLES.md` reflects this updated plan. **(DONE)**
2.  **Clean Grammar & Verify Structure:** Start with a known-good version of `meld.pegjs` or carefully **restructure the existing file** to match the **Recommended Stable Structure** outlined above. Place existing rules into their correct sections. **Run `build:grammar`**. Fix any build errors resulting *only* from reordering before proceeding. **(DONE)**
    *   _Note:_ Performed grammar restructuring. Ran build and tests (`npm run build:grammar && npm test core/ast`). All tests passed, confirming the structural integrity after reordering.

3.  **Refactor Helper Function Access:** Implement the `helpers` object pattern for robust access to helper functions within rule actions. **(DONE)**
    *   **Rationale:** To ensure consistent access to helper functions within rule actions, avoiding potential scoping issues encountered with direct function calls or reliance on the `options` object's state during test runs, and to facilitate easier mocking/testing.
    *   **Sub-steps (Perform Surgically with Frequent Build/Test Cycles):**
        *   **3a. Define `helpers` Structure:** In the grammar initializer block (`{...}`), define `const helpers = { ... };`, including the `...(options && options.helpers ? options.helpers : {})` spread for overrides.
        *   **3b. Move Helper Functions:** Incrementally move the existing standalone function definitions (`debug`, `isLineStart`, `validatePath`, `createNode`, `reconstructRawString`, etc.) *inside* the `helpers` object definition. Remove the original standalone definitions. **Run `build:grammar` frequently.**
        *   **3c. Update Rule Action Calls:** Systematically go through all grammar rule actions (`{ ... }`) and prepend `helpers.` to all calls to the moved functions (e.g., `validatePath(...)` becomes `helpers.validatePath(...)`). Do this section by section or rule by rule. **Run `build:grammar && npm test core/ast` frequently.**
        *   **3d. Final Verification:** Once all calls are updated, run `npm run build:grammar && npm test core/ast` to ensure all tests still pass with the refactored helper access.

4.  **Implement Delimiter-Specific Rules:** Add the rules necessary for parsing content *within* various delimiters, accounting for potential variables. Place these in the "Core Data Structure / Complex Parsing Rules" section. **Run `build:grammar`** after adding each set to verify syntax immediately. **(DONE)**
    *   **4a. Double Quotes (`"..."`):** Add `DoubleQuoteAllowedLiteralChar`, `DoubleQuoteLiteralTextSegment`, `DoubleQuoteInterpolatableContent`, `DoubleQuoteInterpolatableContentOrEmpty`. Ensure `DoubleQuoteAllowedLiteralChar` uses lookahead `!('"' / '{{' / '\\')` to stop at quotes, escapes, or variable starts.
    *   **4b. Single Quotes (`'...'`):** Add `SingleQuote...` rules, similar to Double Quotes but looking for `'`.
    *   **4c. Backticks (``` `...` ```):** Add `Backtick...` rules, similar but looking for `` ` ``.
    *   **4d. Multiline (`[[...]]`):** Add `Multiline...` rules. `MultilineAllowedLiteralChar` needs `!']]' !'{{'` lookahead.
    *   **4e. Brackets (`[...]`):** Add `Bracket...` rules. **Crucially**, ensure `BracketAllowedLiteralChar` uses `!(']' / '{{' / '$')` lookahead. This allows literal nested brackets `[` but stops correctly for the closing `]`, text/data variables `{{`, and path variables `$`, fixing a previously identified parse error.
    *   _Note:_ The `XxxInterpolatableContent` rules should generally try `Variable` before `XxxLiteralTextSegment` (`parts:(Variable / XxxLiteralTextSegment)+`) if Path Variables (`$var`) need to be parsed within that context (like Brackets). Otherwise, `parts:(XxxLiteralTextSegment / Variable)+` is fine. Ensure `Variable` matches all types (`TextVar | DataVar | PathVar`).

5.  **Implement Interpolated Literals:** Define the top-level rules for string and multiline templates that consume the rules from Step 4 and produce the final `InterpolatableValue` array. Place these after the delimiter-specific rules in the "Core Data Structure / Complex Parsing Rules" section. **Run `build:grammar`** after adding each rule. **(DONE)**
    *   **5a. `InterpolatedStringLiteral`:** Define to handle `"..."`, `'...'`, and ``` `...` ```, using the corresponding `XxxInterpolatableContentOrEmpty` rules. The action code should simply be `{ return content; }` as `content` will hold the desired `InterpolatableValue` array.
    *   **5b. `InterpolatedMultilineTemplate`:** Define to handle `[[...]]` using `MultilineInterpolatableContentOrEmpty`. Action code is `{ return content; }`.

6.  **Update Directive Value Rules (One by One):** Modify existing rules that previously consumed simple literals (`StringLiteral`, `MultilineTemplateLiteral`, `DirectiveContent` for paths/commands) to use the new `Interpolated...` rules where appropriate. **Run `build:grammar`** after modifying each rule. **(DONE)**
    *   **6a. `TextValue` (@text):** Replace `StringLiteral` alternative with `InterpolatedStringLiteral`. Replace `MultilineTemplateLiteral` alternative with `InterpolatedMultilineTemplate`. The `value` property will now hold an `InterpolatableValue` array.
    *   **6b. `PropertyValue` (@data):** Replace `StringLiteral` alternative with `InterpolatedStringLiteral`. String values within data structures will now be `InterpolatableValue` arrays.
    *   **6c. `DefineValue` (@define):** Replace `StringLiteral` alternative with `InterpolatedStringLiteral`. The `value` property for string definitions will now hold an `InterpolatableValue` array.
    *   **6d. `PathValue` (@path):** Replace `StringLiteral` alternative with `InterpolatedStringLiteral`. In the action code:
        *   Call `helpers.reconstructRawString(interpolatedArray)` to get the raw path string.
        *   Call `helpers.validatePath(rawString, { context: 'pathDirective' })` to get the validation result object.
        *   Attach the original `interpolatedArray` to the result object as `interpolatedValue`.
        *   Ensure the `PathVar` alternative returns the correct structured object (as fixed previously).
    *   **6e. `_EmbedRHS` (helper for @embed, @data, @text):**
        *   Modify the `[[...]]` alternative to use `MultilineInterpolatableContentOrEmpty`. The `content` property will now hold an `InterpolatableValue` array.
        *   Modify the `[...]` alternative to use `BracketInterpolatableContentOrEmpty`. In the action code, follow the same pattern as `PathValue` (reconstruct raw, validate raw, attach original array as `interpolatedValue` to the resulting `path` object). Note the current simplification for handling sections (`#`) - the full array is attached.
    *   **6f. `_RunRHS` (helper for @run, @data, @text, @define):**
        *   Modify the `[[...]]` alternative to use `MultilineInterpolatableContentOrEmpty`. The `command` property will now hold an `InterpolatableValue` array.
        *   Modify the `[...]` alternative to use `BracketInterpolatableContentOrEmpty`. The `command` property will now hold an `InterpolatableValue` array.

7.  **Run Full Tests:** Once Step 6 is complete and the grammar builds, run `npm test core/ast`. **(DONE)**

## Progress Summary (As of <Current Date>)

We successfully completed the foundational steps:
1.  **Grammar Restructuring (Step 2):** The `meld.pegjs` file was reorganized according to the "Recommended Stable Structure", improving maintainability and resolving potential build issues. All tests passed after this step.
2.  **Helper Function Refactoring (Step 3):** Implemented the `helpers` object pattern for robust and consistent access to helper functions within grammar actions, resolving previous scope-related runtime errors. Tests passed.
3.  **Interpolation Re-implementation (Steps 4-6):** We re-introduced the delimiter-specific rules (`XxxAllowedLiteralChar`, etc.), the `InterpolatedStringLiteral` and `InterpolatedMultilineTemplate` rules, and updated the core directive value rules (`TextValue`, `PropertyValue`, `PathValue`, `_EmbedRHS`, `_RunRHS`) to use these new interpolation mechanisms. The grammar now correctly produces `InterpolatableValue` arrays for string/template/path/command values where appropriate.

Running the full test suite (`npm test core/ast`) after completing Step 6 revealed 9 test failures, indicating mismatches between the generated AST and the test expectations. These failures fall into two categories:

1.  **Specific Grammar/Parsing Issues (2 failures):**
    *   `parser.test.ts`: A test expecting the parser to *reject* `@path config = $HOMEPATH/file` (unquoted path value) is currently passing, indicating the grammar incorrectly allows this syntax.
    *   ~~`embed.test.ts` (`path-with-brackets` case): A test expecting `@embed [file[1].md]` to parse correctly is failing. This suggests an issue in the `BracketInterpolatableContentOrEmpty` rule (or related rules) potentially misinterpreting the `[` within the path.~~ *(Deferred: This is a known issue tracked separately, see GitHub issue #29)*

2.  **Test Fixture Deep Equality Mismatches (7 failures):**
    *   Files affected: `data.test.ts`, `define.test.ts`, `embed.test.ts` (3 cases), `run.test.ts`, `text.test.ts`.
    *   These failures stem from tests using fixtures defined in `core/syntax/types/test-fixtures.ts`. The generated AST nodes include a full `location` object (e.g., `{ start: { offset: ..., line: ..., column: ... }, end: {...} }`), while the expected fixtures use `location: expect.any(Object)`. The deep equality check (`toEqual`) combined with `expect.objectContaining` seems unable to correctly handle this nested `expect.any(Object)` comparison within the larger node structure.

## Next Steps & Path Forward

To resolve the remaining issues, we will proceed as follows:

1.  **Address Test Fixture Mismatches:**
    *   **Update `test-fixtures.ts`:** Modify the expected node structures in `core/syntax/types/test-fixtures.ts` for the 7 failing tests. Instead of relying on `expect.objectContaining` for the entire node, explicitly define the expected structure for each node type, retaining `location: expect.any(Object)` *only* for the location property itself. This will make the comparisons more precise and should resolve the deep equality failures.
    *   **Example (TextNode):**
        ```javascript
        {
          type: 'Text',
          content: 'Some content',
          location: expect.any(Object) // Keep expect.any only for location
        }
        ```
    *   Apply this pattern to all relevant node expectations in the fixtures. Run tests after updating the fixtures to confirm resolution.

2.  **Fix Grammar/Parsing Issues:**
    *   **Unquoted Path Rejection (`parser.test.ts`):** Investigate the `PathValue` rule in `meld.pegjs`. Ensure it strictly requires the path value to be one of the `InterpolatedStringLiteral` types (double, single, or backtick quoted) or a `PathVar`, and explicitly disallows unquoted values like `$HOMEPATH/file`. Adjust the grammar rule and confirm the test now correctly rejects the input.
    *   ~~**Bracket Path Parsing (`embed.test.ts`):** Re-examine the `BracketInterpolatableContentOrEmpty`, `BracketLiteralTextSegment`, and `BracketAllowedLiteralChar` rules. Verify that literal `[` characters are correctly handled within bracketed paths (`[...]`) and do not prematurely terminate parsing or get misinterpreted. Debug the parsing flow for `@embed [file[1].md]` and adjust the rules as needed.~~ *(Deferred: Known issue)*

3.  **Final Verification:** Run the full test suite (`npm test core/ast`) to ensure all tests pass.

## Priority

**High.** Completing the AST variable parsing refactor is crucial for accurate syntax representation and simplifying downstream logic. Resolving the test failures and grammar issues is the immediate next step. 