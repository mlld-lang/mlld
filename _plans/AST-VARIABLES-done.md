# Plan: Context-Aware Variable Parsing in AST

## Goal

Refactor the `@core/ast` parser to be context-aware regarding variable interpolation syntax (`{{...}}`, `$var`). The parser should generate an AST that accurately reflects whether variable syntax represents a reference needing resolution or literal text, based on Meld's language rules. This eliminates the need for downstream services to re-parse strings originating from the AST.

## Problem Statement

Previously, the parser (`@core/ast/grammar/meld.pegjs`) incorrectly parsed variable syntax (`{{...}}` or `$identifier`) as `VariableReferenceNode` even in plain text contexts (outside of directives). It also didn't pre-parse interpolated values within directives. This forced downstream services (`ResolutionService`, directive handlers) to:

1.  **Re-parse** strings during the resolution phase to find potential variables using regex or secondary parsers.
2.  **Carry context** about the string's origin to determine *if* interpolation should occur.
3.  **Risk inconsistency** between the main parser and secondary parsing logic.

This violated the principle of the AST fully representing the parsed structure, pushed syntactic concerns into the semantic resolution phase, and increased complexity and fragility.

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

## Revised Implementation Strategy & Progress

The refactoring is divided into three phases:

**Phase 1: Parser and Type Modifications (DONE)**

*   Status: ✅ Completed.
*   Summary: Updated the parser grammar (`meld.pegjs`) and core type definitions (`@core/syntax/types/`, `@core/types/`) to produce the desired AST structure (`InterpolatableValue`, `StructuredPath.interpolatedValue`). AST tests were updated and verified.
    *   **Parser (`meld.pegjs`):**
        *   Grammar restructured for stability.
        *   Helper function access refactored (`helpers` object).
        *   Delimiter-specific rules (`DoubleQuote...`, `Multiline...`, `Bracket...`, etc.) implemented to handle interpolation contextually.
        *   `InterpolatedStringLiteral`, `InterpolatedMultilineTemplate` rules added to produce `InterpolatableValue` arrays.
        *   Directive value rules (`TextValue`, `DataValue`, `PathValue`, `_EmbedRHS`, `_RunRHS`, etc.) updated to use interpolation rules, generating `InterpolatableValue` arrays or attaching them to `StructuredPath` (as `interpolatedValue`) where appropriate.
    *   **AST Types:**
        *   `InterpolatableValue` type alias (`Array<TextNode | VariableReferenceNode>`) defined and used.
        *   Specific `DirectiveData` interfaces (`EmbedDirectiveData`, `TextDirectiveData`, etc. in `directives.ts`) updated to use `InterpolatableValue` for relevant properties.
        *   `StructuredPath` interface (in `nodes.ts`) updated to include `interpolatedValue?: InterpolatableValue`.
    *   **AST Tests:** Updated to reflect the new AST structure, including expectations for `InterpolatableValue` arrays and literal `TextNode`s in plain text contexts. Grammar parsing issues and test fixture mismatches were resolved.
    *   **Build Script:** Verified.

**Phase 2: Consuming the InterpolatableValue AST (Partially Done)**

*   Status: 🟡 **In Progress**.
*   Summary: Refactoring downstream services and handlers to correctly process and leverage the new `InterpolatableValue` structure produced by the parser, **eliminating redundant parsing** of strings originating from the AST. Significant progress made, but **1 test failure** blocks completion.

    *   **5. Refactor `ResolutionService` Core Logic (`resolveNodes`):**
        *   Status: ✅ Done (Basic processing).
        *   Goal: Create or refine the central internal method for processing `InterpolatableValue` arrays.
        *   Details: Implemented the internal `resolveNodes` method to process `InterpolatableValue` arrays, calling `VariableReferenceResolver` for variables. Removed internal regex parsing for AST values. String building uses `Array.join()`. **Lacks recursive call logic via VariableReferenceResolver.**
    *   **6. Update Public `ResolutionService` Methods:**
        *   Status: ✅ Done.
        *   Goal: Adapt public methods to either directly use `resolveNodes` for pre-parsed inputs or parse plain string inputs *before* calling `resolveNodes`.
        *   Details: Refactored `resolveInContext`, `resolveText`, `resolveContent` to use `resolveNodes` for AST inputs and `ParserServiceClient -> resolveNodes` for string inputs. Updated `resolvePath` to *remove* internal variable resolution.
    *   **7. Refactor `VariableReferenceResolver`:**
        *   Status: ✅ **Done.** (Implementation found in code, contrary to initial plan status).
        *   Goal: Handle recursive resolution when a variable's value is an `InterpolatableValue` array.
        *   Details: Logic using `isInterpolatableValueArray` guard and calling `resolutionService.resolveNodes` exists in the `resolve` method. Unit tests in `VariableReferenceResolver.test.ts` cover this scenario and pass.
            *   **Method:** `resolve(node: VariableReferenceNode, context)`
            *   **Logic:**
                *   Retrieve the variable's value using `stateService.getVariable(node.identifier)`.
                *   **Check Value Type:** If the retrieved `variable.value` is detected to be an `InterpolatableValue` array (needs a reliable check - maybe store metadata or use a type guard):
                    *   Call `resolutionService.resolveNodes(variable.value, context)` (or equivalent public method like `resolveInContext`) to recursively resolve the array.
                    *   Return the resulting resolved string.
                *   If the value is a primitive string, number, boolean, null: Handle field access (if `node.fields` exist) using `accessFields`, then convert the final result to a string using the existing `convertToString` logic.
                *   If the value is a complex object/array (DataVariable): Handle field access using `accessFields`, then convert result using `convertToString`.
                *   Handle path/command variables appropriately (likely returning validated path string or command structure representation).
    *   **8. Refactor Directive Handlers:**
        *   Status: ✅ Done.
        *   Goal: Ensure handlers correctly pass AST structures to `ResolutionService` and use the returned resolved strings. Eliminate direct use of `.raw` where `interpolatedValue` exists and is relevant. Eliminate handler-level string parsing.
        *   Details: Handlers (`@text`, `@data`, `@path`, `@embed`, `@run`, `@import`, `@define`) reviewed and confirmed to call the appropriate `ResolutionService` methods with AST structures and use the returned resolved strings.
            *   **General Pattern:**
                1.  Identify directive properties that are `InterpolatableValue` or `StructuredPath`.
                2.  If `StructuredPath` and `interpolatedValue` exists: Call `resolutionService.resolveNodes(directive.path.interpolatedValue, context)` to get the resolved string.
                3.  If `InterpolatableValue`: Call `resolutionService.resolveNodes(directive.property, context)` to get the resolved string.
                4.  If `StructuredPath` without `interpolatedValue`, or other potentially unresolved string from AST: Call `resolutionService.resolveInContext(directive.property.raw, context)` or `resolutionService.resolveText(directive.stringProperty, context)` to get the resolved string.
                5.  Use the **resolved string** for the handler's logic (e.g., pass to `FileSystemService`, `PathService.resolvePath`, state assignment, command execution).
            *   **Specific Handlers (Examples):**
                *   **`@text`, `@data`, `@define`:** Use `resolveNodes` on `directive.value` (or `directive.command.command`) if it's `InterpolatableValue`.
                *   **`@path`:** Call `resolveNodes` on `directive.path.interpolatedValue` to get resolved path string. Pass resolved string to `PathService` methods if needed.
                *   **`@run`:** Call `resolveNodes` on `directive.command` if it's `InterpolatableValue`.
                *   **`@embed`:**
                    *   `embedTemplate`: Call `resolveContent` or `resolveNodes` on `directive.content`.
                    *   `embedVariable`: Call `resolveInContext` on `directive.path` (which is `StructuredPath` potentially containing `interpolatedValue` if defined via brackets, or other structure if `{{var}}`). `resolveInContext` handles the different cases.
                    *   `embedPath`: Call `resolveNodes` on `directive.path.interpolatedValue` to get resolved path string. Use resolved string with `FileSystemService`. Pass resolved string to `resolutionService.resolvePath` *only if* the `MeldPath` object itself is still needed.
                *   **`@import`:** Call `resolveNodes` on `directive.path.interpolatedValue` to get resolved path string. Use resolved string to locate/load the file. Pass resolved string to `resolutionService.resolvePath` *only if* the `MeldPath` object itself is still needed.
    *   **9. Update Tests (ResolutionService, VariableReferenceResolver, Handlers):**
        *   Status: 🟡 **Investigating Final Failure**.
        *   Details: Significant progress made resolving the initial ~13 test failures. Most mocks and assertions updated.
            *   **Fixes Applied (Summary):** 
                *   Corrected DI registrations (`ILogger`).
                *   Updated assertions for `DirectiveResult` refactor.
                *   Fixed logic errors in `DataDirectiveHandler`, `ImportDirectiveHandler`.
                *   Refactored mocks extensively (e.g., `ImportDirectiveHandler`, `InterpreterService`).
                *   Corrected test helper functions (`createValidDefineNode`).
                *   Adjusted error message/type assertions.
            *   **Remaining Failure (1):**
                *   `ImportDirectiveHandler.transformation.test.ts` (1 failure): Error message mismatch for `FILE_NOT_FOUND`. This test needs its assertion adjusted to match the slightly more detailed error message format.
            *   **Sub-items Status Update:**
                *   **`ResolutionService` Tests:** 🟡 Likely okay, pending full suite pass.
                *   **`VariableReferenceResolver` Tests:** ✅ Done, tests pass.
                *   **Directive Handler Tests:** 🟡 Most handler tests fixed. Final `Import` transformation test remains.
                *   **Integration Tests:** 🟡 Likely okay, pending final unit test fix.
    *   **10. Verification:**
        *   Status: 🟡 **Blocked**.
            *   Blocked by the final failing test in Step 9.
            *   Manual testing.

**Phase 3: Resolve TextNode Content During Interpretation (Not Started)**

*   Status: ❌ Not Started.
*   Summary: Shifting the responsibility of resolving `{{...}}` within `TextNode.content` from the `OutputService` to the `InterpreterService`.

    *   **1. Inject `ParserServiceClientFactory` into `InterpreterService`:**
        *   Status: ❌ **TO DO - High Priority.**
        *   Goal: Provide `InterpreterService` with the capability to parse string fragments.
        *   Action: Modify the constructor (`constructor(...)`) to inject `ParserServiceClientFactory` (similar to how `DirectiveServiceClientFactory` is injected). Store an instance of `IParserServiceClient` obtained from the factory in a private member variable (e.g., `this.parserClient`), initializing it in `initializeFromParams` or lazily in an `ensureParserClientInitialized` method (following the pattern for other clients). Add necessary imports for the factory and client interface.
        *   Rationale: Provides `InterpreterService` with the capability to parse string fragments.
    *   **2. Modify `InterpreterService.interpretNode` Logic for `TextNode`:**
        *   Status: ❌ **TO DO - High Priority.**
        *   Goal: Add logic to `case 'Text':` to check for `{{...}}`, parse using `ParserServiceClient`, resolve using `ResolutionService.resolveNodes`, and add the *resolved* `TextNode` to state.
        *   Action: Locate the `case 'Text':` block within the `interpretNode` method.
            *   Inside this case, *before* the existing `textState.addNode(node)` line, add a check: `if (node.content.includes('{{'))`.
            *   **Inside the `if (node.content.includes('{{'))` block:**
                *   Ensure the parser client is initialized (e.g., `this.ensureParserClientInitialized()`).
                *   Call the parser client to parse the content: `const parsedNodes: InterpolatableValue = await this.parserClient.parseString(node.content, { filePath: state.getCurrentFilePath() });` (Use `parseString` based on the client interface).
                *   Ensure `ResolutionService` is available (`this.resolutionService`).
                *   Create the `ResolutionContext`: `const context = ResolutionContextFactory.create(state, state.getCurrentFilePath());` (Adjust factory call if needed).
                *   Call `resolveNodes`: `const resolvedContent = await this.resolutionService.resolveNodes(parsedNodes, context);`
                *   Create a *new* `TextNode`: `const resolvedNode: TextNode = { ...node, content: resolvedContent };` (This preserves location and any existing metadata).
                *   **Replace** the original `node` variable with this `resolvedNode`: `node = resolvedNode;`
                *   Add logging to indicate resolution occurred.
            *   **After the `if` block:** Proceed with the existing logic `const textState = currentState.clone(); textState.addNode(node); currentState = textState;`. This now adds either the original node (if no `{{...}}` found) or the *newly created resolved node* to the state.
        *   Rationale: Integrates `TextNode` resolution directly into the node processing flow, ensuring the state receives resolved content.
    *   **3. Remove Final Resolution Pass from `InterpreterService.interpret`:**
        *   Status: ✅ Done (Verified removed).
        *   Goal: Remove redundant final pass over nodes.
        *   Rationale: Resolution is now handled node-by-node in `interpretNode`, making the final pass unnecessary.
    *   **4. Simplify `OutputService` (`nodeToMarkdown` / `nodeToXML`):**
        *   Status: ❌ **TO DO - High Priority.**
        *   Goal: Remove regex and `resolveVariableReference` calls for `TextNode` content, treating it as pre-resolved.
        *   Action: Locate the `case 'Text':` blocks within `nodeToMarkdown` and `nodeToXML` (or their helpers like `processTextNode`).
            *   **Remove** the entire logic block starting around `if (state.isTransformationEnabled() && content.includes('{{'))` that uses `variableRegex`, calls `resolutionService.resolveVariable`, and performs string replacement.
            *   **Remove** any fallback logic that also attempts to parse/resolve `TextNode` content using `resolutionClient` or `resolutionService`.
            *   Ensure the remaining logic simply takes `node.content` (which is now guaranteed to be pre-resolved) and applies the necessary formatting (like `handleNewlines`).
        *   Rationale: `OutputService` no longer needs to resolve variables in `TextNode` content.
    *   **5. Update `InterpreterService` Tests:**
        *   Status: ❌ **TO DO - Medium Priority.**
        *   Action:
            *   Update DI setup/mocks to provide `ParserServiceClientFactory` and `IParserServiceClient`.
            *   Mock `parserClient.parseString` to return specific `InterpolatableValue` arrays for relevant test cases.
            *   Mock `resolutionService.resolveNodes` to return expected resolved strings.
            *   Adjust assertions for `state.addNode` (or mocks of it) to verify it's called with a `TextNode` containing the *expected resolved* content when the input node had variables.
        *   Rationale: Tests the new `TextNode` resolution path within `InterpreterService`.
    *   **6. Update `OutputService` Tests:**
        *   Status: ❌ **TO DO - Medium Priority.**
        *   Action:
            *   Remove mocks for `resolutionService.resolveVariable` (or similar) related to `TextNode` processing.
            *   Update test inputs: Provide `TextNode`s with *pre-resolved* content in their `content` property for scenarios involving variables.
            *   Verify the output matches the pre-resolved content string, correctly formatted.
        *   Rationale: Reflects the simplified, format-only role of `OutputService` for `TextNode`s.
    *   **7. Verification:**
        *   Status: 🟡 **Blocked**.
            *   Blocked by failing test in Step 9.
            *   Manual testing.

## Downstream Impact Outline

*   **`ResolutionService`:** Largely refactored. Recursive resolution handled by `VariableReferenceResolver`.
*   **`VariableReferenceResolver`:** Updated for recursive resolution (verified).
*   **Directive Handlers:** Updated to use new `ResolutionService` APIs and `DirectiveResult` structure. Verified correct.
*   **`InterpreterService`:** Needs refactoring for Phase 3 to handle `TextNode` resolution using `ParserServiceClient` and `ResolutionService`.
*   **`OutputService`:** Needs simplification for Phase 3 to remove `TextNode` resolution.
*   **`ParserServiceClient`:** Correctly used by `ResolutionService`; needs to be added to `InterpreterService` for Phase 3.
*   **Tests:** Handler/Integration tests require final review after remaining Phase 2 failure is fixed. Updates needed for `InterpreterService`, `OutputService` as part of Phase 3.

## Priority

**High.** Completing Phase 2 (resolving the final test failure) and Phase 3 is essential for the stability and correctness of the variable resolution pipeline. 