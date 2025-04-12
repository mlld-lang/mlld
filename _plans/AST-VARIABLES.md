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

The refactoring is divided into two phases:

**Phase 1: Parser and Type Modifications (Completed)**

This phase focused on updating the parser grammar (`meld.pegjs`) and core type definitions (`@core/syntax/types/`, `@core/types/`) to produce the desired AST structure.

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

**Phase 2: Consuming the InterpolatableValue AST (To Do)**

This phase focuses on refactoring downstream services and handlers to correctly process and leverage the new `InterpolatableValue` structure produced by the parser, **eliminating redundant parsing** of strings originating from the AST.

**5. Refactor `ResolutionService` Core Logic (`resolveNodes`):**

*   **Goal:** Create or refine the central internal method for processing `InterpolatableValue` arrays.
*   **Method Signature (Example):** `private async resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>`
*   **Logic:**
    *   Initialize an empty result string.
    *   Iterate through the input `nodes` array.
    *   If `node.type === 'Text'`, append `node.content` to the result.
    *   If `node.type === 'VariableReference'`:
        *   Call `VariableReferenceResolver.resolve(node, context)` (or appropriate internal method).
        *   **Crucially:** The resolver must return the **fully resolved string value** of the variable. If the variable's stored value is *itself* an `InterpolatableValue` array (due to its definition), the resolver must recursively call back into `this.resolveNodes` (or a public equivalent like `resolveInContext`) to resolve that array before returning the final string. (See Step 7).
        *   Append the resolved string to the result.
    *   Handle potential errors during variable resolution based on `context.strict`.
*   **Cleanup:** Remove all internal regex-based variable searching/replacement logic previously used on strings derived from the AST.

**6. Update Public `ResolutionService` Methods:**

*   **Goal:** Adapt public methods to either directly use `resolveNodes` for pre-parsed inputs or parse plain string inputs *before* calling `resolveNodes`.
*   **`resolveInContext(value: string | StructuredPath, context)`:**
    *   If `value` is `StructuredPath` and `value.interpolatedValue` exists: Call `this.resolveNodes(value.interpolatedValue, context)`.
    *   If `value` is `StructuredPath` *without* `interpolatedValue`: Treat `value.raw` as a plain string input (see next case).
    *   If `value` is `string`:
        *   Optimization: Check for `{{` or `$`. If none, return `value`.
        *   **Parse the string:** Use `ParserServiceClient` (or injected `IParserService`) to parse the input `value` string into an `InterpolatableValue` array. This handles strings not originating from the main AST parse.
        *   Call `this.resolveNodes` on the resulting array.
*   **`resolveText(text: string, context)`:**
    *   Optimization: Check for `{{` or `$`. If none, return `text`.
    *   **Parse the string:** Use `ParserServiceClient` to parse the input `text` into an `InterpolatableValue` array.
    *   Call `this.resolveNodes` on the resulting array.
*   **`resolveContent(nodes: MeldNode[], context)`:**
    *   This method already receives a node array. Ensure its internal logic correctly identifies and handles `TextNode` vs `VariableReferenceNode` consistent with the `resolveNodes` pattern, likely by calling `resolveNodes` directly or using `VariableReferenceResolver` appropriately for variable nodes. Remove any assumptions that child nodes are simple strings needing `resolveText`.
*   **`resolvePath(pathString: string, context)`:**
    *   **Responsibility:** This method's core job is path validation and normalization *after* any variables within the path string have already been resolved.
    *   **Remove Internal Resolution:** Remove any logic within `resolvePath` that attempts to find or resolve variables using regex or parsing.
    *   **Caller Responsibility:** Callers (like directive handlers) are responsible for obtaining the fully resolved path string (by calling `resolveNodes` on `directive.path.interpolatedValue` if available, or `resolveInContext` on `directive.path.raw` otherwise) *before* passing that final string to `resolvePath`.

**7. Refactor `VariableReferenceResolver`:**

*   **Goal:** Handle recursive resolution when a variable's value is an `InterpolatableValue` array.
*   **Method:** `resolve(node: VariableReferenceNode, context)`
*   **Logic:**
    *   Retrieve the variable's value using `stateService.getVariable(node.identifier)`.
    *   **Check Value Type:** If the retrieved `variable.value` is detected to be an `InterpolatableValue` array (needs a reliable check - maybe store metadata or use a type guard):
        *   Call `resolutionService.resolveNodes(variable.value, context)` (or equivalent public method like `resolveInContext`) to recursively resolve the array.
        *   Return the resulting resolved string.
    *   If the value is a primitive string, number, boolean, null: Handle field access (if `node.fields` exist) using `accessFields`, then convert the final result to a string using the existing `convertToString` logic.
    *   If the value is a complex object/array (DataVariable): Handle field access using `accessFields`, then convert result using `convertToString`.
    *   Handle path/command variables appropriately (likely returning validated path string or command structure representation).

**8. Refactor Directive Handlers:**

*   **Goal:** Ensure handlers correctly pass AST structures to `ResolutionService` and use the returned resolved strings. Eliminate direct use of `.raw` where `interpolatedValue` exists and is relevant. Eliminate handler-level string parsing.
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

**9. Update Tests:**

*   **`ResolutionService` Tests:** Focus on inputs (`InterpolatableValue`, `StructuredPath` w/ `interpolatedValue`, plain strings) and assert correct resolved string outputs. Mock `VariableReferenceResolver`, `ParserServiceClient`. Test recursive resolution.
*   **`VariableReferenceResolver` Tests:** Test the case where `getVariable` returns an `InterpolatableValue` array; mock `resolutionService.resolveNodes` and verify it's called correctly.
*   **Directive Handler Tests:** Update mocks for `ResolutionService` methods to reflect they now take AST structures/arrays and return resolved strings. Verify handlers call the correct methods and use the returned strings properly.
*   **Integration Tests:** Verify end-to-end scenarios with various levels of interpolation work correctly.

**10. Verification:**

*   Manual testing.
*   Full test suite (`npm test`).

## Downstream Impact Outline (Revised)

*   **`ResolutionService`:** Major refactoring. Becomes the sole owner of resolving `InterpolatableValue` AST structures. Removes regex parsing for AST-derived values. Requires careful handling of recursive resolution and distinguishing between pre-parsed AST inputs and plain string inputs (which still need parsing).
*   **`VariableReferenceResolver`:** Needs update to handle recursive resolution by calling back into `ResolutionService` when a variable's value is an `InterpolatableValue`.
*   **Directive Handlers:** Simplified logic. No longer parse strings from AST. Consistently call `ResolutionService` with appropriate AST structures/arrays and use the returned resolved string.
*   **`ParserServiceClient`:** Becomes crucial for `ResolutionService` to handle plain string inputs that need parsing *before* node resolution.
*   **Tests:** Extensive updates required.

## Implementation Steps (Revised for Phase 2)

1.  **Phase 1: Parser/Type Changes:** **(DONE)**
2.  **Phase 2 Step 5: Refactor `ResolutionService` Core Logic (`resolveNodes`):** Implement the internal `resolveNodes` method to process `InterpolatableValue` arrays, calling `VariableReferenceResolver` for variables. **Crucially, ensure this step does NOT yet handle recursion.** Remove internal regex parsing for AST values. **(TO DO - High Priority)**
3.  **Phase 2 Step 7: Refactor `VariableReferenceResolver`:** Update `resolve` to detect when a variable's value is an `InterpolatableValue` array. **Temporarily,** return a placeholder string or reconstruct the raw string representation for this case (e.g., using `helpers.reconstructRawString`). This isolates the recursion dependency. **(TO DO - High Priority)**
4.  **Phase 2 Step 6: Update Public `ResolutionService` Methods:** Refactor `resolveInContext`, `resolveText`, `resolveContent` to use `resolveNodes` for AST inputs and `ParserServiceClient -> resolveNodes` for string inputs. Update `resolvePath` to *remove* internal variable resolution. **(TO DO - High Priority)**
5.  **Phase 2 Step 9: Update `ResolutionService` Tests:** Update tests for non-recursive cases based on Steps 2 & 4. **(TO DO - High Priority)**
6.  **Phase 2 Step 5 & 7 (Recursion):** Now, implement the recursive call within `VariableReferenceResolver` (Step 3) and ensure `resolveNodes` (Step 2) correctly handles being called recursively. Update tests (Step 5) to cover recursion. **(TO DO - High Priority)**
7.  **Phase 2 Step 8: Refactor Directive Handlers:** Update handlers (`@text`, `@data`, `@path`, `@embed`, `@run`, `@import`, `@define`) one by one to call the refactored `ResolutionService` methods with AST structures and use the returned resolved strings. **(TO DO - Medium Priority)**
8.  **Phase 2 Step 9: Update Handler Tests:** Update unit tests for each refactored handler. **(TO DO - Medium Priority)**
9.  **Phase 2 Step 9: Update Integration Tests:** Update end-to-end tests. **(TO DO - Medium Priority)**
10. **Phase 2 Step 10: Verification:** Perform final testing. **(TO DO - Low Priority)**

## Priority

**High.** Completing Phase 2 is essential. Refactoring `ResolutionService` and `VariableReferenceResolver` (Steps 2-6) is the immediate priority. 

---

**Phase 3: Resolve TextNode Content During Interpretation**

*   **Goal:** Eliminate variable resolution logic (specifically the regex-based detection and substitution of `{{...}}`) from `OutputService`. Ensure that `TextNode` content is fully resolved *before* being stored in the final `StateService.transformedNodes` list, aligning with the principle that `OutputService` should only handle formatting of pre-resolved content.
*   **Problem:** Currently, the core parser produces `TextNode` with raw `content` strings containing unresolved `{{...}}`. `OutputService` (in `nodeToMarkdown`/`nodeToXML`) uses regex to find `{{...}}` within this content and calls `ResolutionService.resolveVariable` just before formatting the final output. This violates the planned architecture.
*   **Approach:** Modify the pipeline orchestration (`InterpreterService`) to handle the resolution of `TextNode` content *during the main node processing loop*. When `InterpreterService.interpretNode` processes a `TextNode`, it will check for `{{...}}` syntax. If found, it will:
    1.  Use the `ParserServiceClient` (injected via factory) to parse the `TextNode.content` string into an `InterpolatableValue` array (`Array<TextNode | VariableReferenceNode>`).
    2.  Use the existing injected `ResolutionService` to call `resolveNodes` on this array, obtaining the fully resolved string.
    3.  Create a **new** `TextNode` using the resolved string content, preserving original location and metadata.
    4.  Add this *new, resolved* `TextNode` to the `StateService` using `state.addNode()` (or potentially `state.transformNode()` if we consider this a transformation, though adding might be simpler).
    `OutputService` will be simplified to treat `TextNode.content` as literal, already-resolved text.

**Detailed Steps (Phase 3):**

1.  **Inject `ParserServiceClientFactory` into `InterpreterService`:**
    *   **File:** `services/pipeline/InterpreterService/InterpreterService.ts`
    *   **Action:** Modify the constructor (`constructor(...)`) to inject `ParserServiceClientFactory` (similar to how `DirectiveServiceClientFactory` is injected). Store an instance of `IParserServiceClient` obtained from the factory in a private member variable (e.g., `this.parserClient`), initializing it in `initializeFromParams` or lazily in an `ensureParserClientInitialized` method (following the pattern for other clients). Add necessary imports for the factory and client interface.
    *   **Rationale:** Provides `InterpreterService` with the capability to parse string fragments.

2.  **Modify `InterpreterService.interpretNode` Logic for `TextNode`:**
    *   **File:** `services/pipeline/InterpreterService/InterpreterService.ts`
    *   **Action:** Locate the `case 'Text':` block within the `interpretNode` method.
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
    *   **Rationale:** Integrates `TextNode` resolution directly into the node processing flow, ensuring the state receives resolved content.

3.  **Remove Final Resolution Pass from `InterpreterService.interpret`:**
    *   **File:** `services/pipeline/InterpreterService/InterpreterService.ts`
    *   **Action:** Delete the entire `// <<< START: Final Resolution Pass >>>` to `// <<< END: Final Resolution Pass >>>` block near the end of the `interpret` method. This block currently attempts a final pass using `resolveText`, which is now redundant and incorrect.
    *   **Rationale:** Resolution is now handled node-by-node in `interpretNode`, making the final pass unnecessary.

4.  **Simplify `OutputService` (`nodeToMarkdown` / `nodeToXML`):**
    *   **File:** `services/pipeline/OutputService/OutputService.ts`
    *   **Action:** Locate the `case 'Text':` blocks within `nodeToMarkdown` and `nodeToXML` (or their helpers like `processTextNode`).
        *   **Remove** the entire logic block starting around `if (state.isTransformationEnabled() && content.includes('{{'))` that uses `variableRegex`, calls `resolutionService.resolveVariable`, and performs string replacement.
        *   **Remove** any fallback logic that also attempts to parse/resolve `TextNode` content using `resolutionClient` or `resolutionService`.
        *   Ensure the remaining logic simply takes `node.content` (which is now guaranteed to be pre-resolved) and applies the necessary formatting (like `handleNewlines`).
    *   **Rationale:** `OutputService` no longer needs to resolve variables in `TextNode` content.

5.  **Update `InterpreterService` Tests:**
    *   **File:** `services/pipeline/InterpreterService/InterpreterService.unit.test.ts` (and potentially integration tests).
    *   **Action:**
        *   Update DI setup/mocks to provide `ParserServiceClientFactory` and `IParserServiceClient`.
        *   Mock `parserClient.parseString` to return specific `InterpolatableValue` arrays for relevant test cases.
        *   Mock `resolutionService.resolveNodes` to return expected resolved strings.
        *   Adjust assertions for `state.addNode` (or mocks of it) to verify it's called with a `TextNode` containing the *expected resolved* content when the input node had variables.
    *   **Rationale:** Tests the new `TextNode` resolution path within `InterpreterService`.

6.  **Update `OutputService` Tests:**
    *   **File:** `services/pipeline/OutputService/OutputService.test.ts`.
    *   **Action:**
        *   Remove mocks for `resolutionService.resolveVariable` (or similar) related to `TextNode` processing.
        *   Update test inputs: Provide `TextNode`s with *pre-resolved* content in their `content` property for scenarios involving variables.
        *   Verify the output matches the pre-resolved content string, correctly formatted.
    *   **Rationale:** Reflects the simplified, format-only role of `OutputService` for `TextNode`s.

7.  **Verification:**
    *   Run all unit and integration tests (`npm test`).
    *   Perform manual testing with documents containing variables in plain text blocks mixed with directives.

**Priority:** **High**. This phase completes the core goal of the AST variable refactoring. 