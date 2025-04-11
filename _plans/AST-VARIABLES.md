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

**Phase 1: Parser and Type Modifications (Completed)**

This phase focused on updating the parser grammar and core type definitions.

**1. Detailed `meld.pegjs` Modification Strategy (Inline Approach):**

*   **Adhere to Strict Rule Order:** (DONE)
*   **Top-Level Parsing:** (DONE)
*   **Core Rule Preservation:** (DONE)
*   **Delimiter-Specific Interpolation Rules:** (DONE)
*   **Update Literal/Template Parsing Rules:** (DONE)
*   **Update Directive Value Rules:** (DONE)
*   **Path Handling:** (DONE - Parser generates `interpolatedValue`)
*   **Helper Functions:** (DONE - `parseInterpolated` removed, `helpers` pattern implemented)

**2. AST Type Updates (`@core/types/`, `@core/syntax/types/`)**

*   **Define `InterpolatableValue`:** (DONE)
*   **Define Specific `DirectiveData` Interfaces:** (DONE)
*   **Update `StructuredPath`:** (DONE - Added `interpolatedValue?: InterpolatableValue;` to definition in `core/syntax/types/nodes.ts`)

**3. AST Test Update Strategy (`meld-spec`, `*.test.ts`)**

*   **Role of Tests:** (DONE - Used for validation)
*   **Plain Text Tests:** (DONE)
*   **Directive Interpolation Tests:** (DONE - Added/Updated)
*   **Existing Literal Tests:** (DONE)
*   **Rejection Tests:** (DONE)
*   **Debugging Workflow:** (DONE - Used)

**4. Build Script (`build-grammar.mjs`)**

*   (DONE - Verified)

**Phase 2: Consuming the InterpolatableValue AST (To Do)**

This phase focuses on refactoring downstream services and handlers to correctly process and leverage the new `InterpolatableValue` structure produced by the parser.

**5. Refactor `ResolutionService` Core Logic:**

*   **Goal:** Centralize the logic for processing `InterpolatableValue` arrays within `ResolutionService`, removing the need for other components to handle this structure directly or perform regex-based variable searching.
*   **Identify/Create Core Helper:** Locate or create the internal `ResolutionService` method responsible for processing an array of nodes (e.g., `resolveNodes` or similar). This method will become the primary implementation site.
*   **Implement `resolveNodes` (or similar):**
    *   Input: `nodes: InterpolatableValue` (or `MeldNode[]`), `context: ResolutionContext`.
    *   Output: `Promise<string>` (the final resolved string).
    *   Logic: Iterate through the `nodes` array.
        *   If `node.type === 'Text'`, append `node.content` to the result string.
        *   If `node.type === 'VariableReference'`, call `VariableReferenceResolver.resolve(node, context)` (or the appropriate internal method) to get the variable's resolved string value, and append it.
        *   Handle potential errors during variable resolution based on `context.strict`.
*   **Remove Regex Parsing:** Completely remove any existing logic within `ResolutionService` that uses regular expressions (e.g., `/\{\{.*?\}\}/g`) to find and replace variables in strings. Resolution should now rely solely on processing the AST nodes.

**6. Update Public `ResolutionService` Methods:**

*   **`resolveInContext(value: string | StructuredPath, ...)`:**
    *   If `value` is `StructuredPath` and `value.interpolatedValue` exists, call `resolveNodes(value.interpolatedValue, context)` and return the result.
    *   If `value` is `string`:
        *   Check if string contains variable markers (`{{`, `$`). If not, return string directly (optimization).
        *   Use `ParserServiceClient` (or injected `IParserService`) to parse the `value` string into an `InterpolatableValue` array (e.g., using a specific parser rule designed for inline content or a lightweight parsing mode).
        *   Call `resolveNodes` on the resulting array.
    *   If `value` is `StructuredPath` *without* `interpolatedValue`, pass `value.raw` to the string-handling logic above.
*   **`resolvePath(pathString: string, ...)`:**
    *   Current signature expects `string`. Keep this signature for now.
    *   Internally, the implementation should first check if the `pathString` contains variable markers.
    *   If markers exist, parse the `pathString` into an `InterpolatableValue` array (using `ParserServiceClient` or similar).
    *   Call `resolveNodes` on the array to get the fully resolved path string.
    *   Use the *resolved* path string for subsequent path validation (`validatePath`) and normalization logic to produce the final `MeldPath`.
    *   *(Alternative Future Enhancement: Overload `resolvePath` to directly accept `StructuredPath`. If `interpolatedValue` exists, resolve it first using `resolveNodes`. If not, use `raw` string. This avoids redundant parsing if the caller already has the `StructuredPath` object.)*
*   **`resolveText(text: string, ...)`:**
    *   Similar to `resolveInContext`'s string handling: Parse the input `text` string into an `InterpolatableValue` array using `ParserServiceClient`, then call `resolveNodes`. Remove any old regex logic.
*   **`resolveContent(nodes: MeldNode[], ...)`:**
    *   This method already takes `MeldNode[]`. Review its implementation. If it calls other methods like `resolveText` internally on node content, ensure those calls are updated. If it directly iterates and resolves, ensure its logic aligns with the new `resolveNodes` pattern (using `VariableReferenceResolver` for `VariableReferenceNode`s).

**7. Refactor Directive Handlers:**

*   **General Principle:** Identify directive properties that are now typed as `InterpolatableValue` or `StructuredPath`. Instead of using raw strings or performing local resolution, call the appropriate updated `ResolutionService` method (`resolveInContext`, `resolvePath`, `resolveText`, `resolveNodes`) to get the final resolved string value needed by the handler's logic.
*   **Specific Handlers:**
    *   **`@text`, `@data`:** Resolve `directive.value` (if `InterpolatableValue`) using `resolveNodes` or `resolveInContext`. Use the resulting string/value for assignment. For `embed`/`run` sources, resolve the relevant properties within `directive.embed` or `directive.run` before assignment.
    *   **`@define`:** Resolve `directive.value` (if `InterpolatableValue`) or `directive.command.command` (if `InterpolatableValue`) using `resolveNodes` or `resolveInContext` before storing the definition.
    *   **`@path`:** Resolve `directive.path.interpolatedValue` using `resolveNodes` to get the target path *string*. Pass this resolved string to `PathService` or for further validation/assignment. *(Update: Current handler likely uses `resolvePath` which should now internally handle the interpolation based on Step 6).* Confirm `PathDirectiveHandler` calls `resolutionService.resolvePath(directive.path.raw, ...)` and relies on `resolvePath`'s updated internal logic.
    *   **`@run`:** Resolve `directive.command` (if `InterpolatableValue`) using `resolveNodes` or `resolveInContext` to get the final command string or script content before execution. Resolve arguments if they are `VariableReferenceNode`s.
    *   **`@embed`:**
        *   `embedTemplate`: Resolve `directive.content` (`InterpolatableValue`) using `resolveContent` (or `resolveNodes`).
        *   `embedVariable`: Resolve `directive.path` (which holds variable structure or `StructuredPath`) using `resolveInContext`. *(Update: Current handler passes `directive.path.raw`)*. Update handler to pass `directive.path` object if `resolveInContext` correctly handles `StructuredPath` with `interpolatedValue` after Step 6.
        *   `embedPath`: Resolve `directive.path.interpolatedValue` *first* using `resolveNodes` to get the target path string. Then use *that string* with `PathService`/`FileSystemService` calls. *(Update: Current handler uses `resolvePath(directive.path.raw, ...)` which relies on `resolvePath`'s updated internal logic).* Confirm `EmbedDirectiveHandler` relies on `resolvePath` for `embedPath`.
    *   **`@import`:** Resolve `directive.path.interpolatedValue` using `resolveNodes` to get the target path string *before* attempting to locate and parse the imported file. *(Update: Current handler uses `resolvePath(directive.path.raw, ...)`).* Confirm `ImportDirectiveHandler` relies on `resolvePath`.

**8. Update Tests:**

*   **`ResolutionService` Tests:** Update unit tests to pass `InterpolatableValue` arrays and `StructuredPath` objects (with `interpolatedValue`) to relevant methods. Assert that the output strings are correctly resolved. Mock `VariableReferenceResolver` and `ParserServiceClient` as needed.
*   **Directive Handler Tests:** Update unit tests. Mock the updated `ResolutionService` methods (`resolveInContext`, `resolvePath`, etc.) to return expected resolved strings based on the handler's input AST node (containing `InterpolatableValue` etc.). Verify the handler uses the resolved value correctly.
*   **Integration Tests (`api.test.ts`, etc.):** Ensure end-to-end tests involving directives with interpolated values (strings, paths, templates, commands) produce the correct final output.

**9. Verification:**

*   Perform manual testing with various interpolation scenarios in different directive contexts.
*   Run the full test suite (`npm test`) to ensure no regressions.

## Downstream Impact Outline (Updated)

*   **`ResolutionService`:** **Major refactoring required** to implement AST-based resolution (iterate `InterpolatableValue`, call `VariableReferenceResolver`) and remove regex-based logic. Public methods need updating to handle `StructuredPath` with `interpolatedValue` or parse input strings into `InterpolatableValue` before calling core resolution logic.
*   **Directive Handlers (`Text`, `Data`, `Define`, `Path`, `Run`, `Embed`, `Import`):** **Significant refactoring required.** Must adapt to receive `InterpolatableValue` / `StructuredPath` properties and call updated `ResolutionService` methods for resolution instead of handling raw strings or doing local parsing.
*   **Path Resolution Logic:** Needs careful review. Logic using path strings must ensure they are fully resolved (via `resolveNodes` or updated `resolvePath`) *before* being passed to `PathService` or `FileSystemService`.
*   **General AST Consumers:** Any code directly accessing affected directive node properties must handle `InterpolatableValue`.
*   **Tests:** **Extensive updates required** across unit and integration tests to reflect the new AST structures and `ResolutionService` behavior.

## Implementation Steps (Updated)

1.  **Prepare:** Ensure `@_plans/AST-VARIABLES.md` reflects this updated plan. **(DONE)**
2.  **Phase 1: Parser/Type Changes (Steps 2-7 of original plan):** **(DONE)**
3.  **Phase 2 Step 5: Refactor `ResolutionService` Core Logic:** Implement `resolveNodes` (or similar) to iterate `InterpolatableValue` and call `VariableReferenceResolver.resolve`. Remove regex logic. **(TO DO - High Priority)**
4.  **Phase 2 Step 6: Update Public `ResolutionService` Methods:** Refactor `resolveInContext`, `resolvePath`, `resolveText`, `resolveContent` to use `resolveNodes` and handle string parsing via `ParserServiceClient`. **(TO DO - High Priority)**
5.  **Phase 2 Step 8: Update `ResolutionService` Tests:** Write/update unit tests for the refactored `ResolutionService` methods. **(TO DO - High Priority)**
6.  **Phase 2 Step 7: Refactor Directive Handlers:** Update handlers one by one (`@text`, `@data`, `@path`, `@embed`, `@run`, `@import`, `@define`) to call the refactored `ResolutionService` methods. **(TO DO - Medium Priority)**
7.  **Phase 2 Step 8: Update Handler Tests:** Update unit tests for each refactored handler. **(TO DO - Medium Priority)**
8.  **Phase 2 Step 8: Update Integration Tests:** Update end-to-end tests. **(TO DO - Medium Priority)**
9.  **Phase 2 Step 9: Verification:** Perform final testing. **(TO DO - Low Priority)**

## Priority

**High.** Completing Phase 2 (consuming the `InterpolatableValue` AST) is critical for realizing the benefits of the parser refactoring, simplifying downstream logic, and improving overall system robustness. Refactoring `ResolutionService` is the most critical next step. 