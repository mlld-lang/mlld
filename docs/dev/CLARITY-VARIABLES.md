# Variable Handling in Meld: Understanding and Implementation

## Core Concepts: The Three Variable Types

Meld utilizes three distinct variable types, each identified by its reference syntax and intended purpose:

1.  **Path Variables (`$var`)**:
    *   **Definition**: `@path identifier = "$PROJECTPATH/..."` or `@path other = $anotherPath/...`
    *   **Reference**: `$variableName` (e.g., `$docs`, `$PROJECTPATH`, `$.`, `$~`)
    *   **Purpose**: Represents filesystem paths. Used primarily within square brackets `[...]` for `@add`, `@run`, and command arguments.
    *   **Resolution**: Resolved by `PathResolver` using `StateService.getPathVar()`. Values are typically absolute paths.
    *   **Constraints**: No field access. Strict path validation rules apply.

2.  **Text Variables (`{{var}}`)**:
    *   **Definition**: `@text identifier = "string"` or `@text id = @run[...]` or `@text id = @add[...]`
    *   **Reference**: `{{variableName}}`
    *   **Purpose**: Stores simple, unstructured string values.
    *   **Resolution**: Resolved by `VariableReferenceResolver` using `StateService.getTextVar()`.
    *   **Constraints**: No field access (atomic value).

3.  **Data Variables (`{{var}}`, `{{var.field}}`, `{{var.0}}`)**:
    *   **Definition**: `@data identifier = {{...}}` or `@data id = '[...]` or `@data id = @run[...]` (expecting JSON output)
    *   **Reference**: `{{variableName}}` (for the whole structure), `{{variableName.fieldName}}`, `{{variableName.arrayIndex}}`
    *   **Purpose**: Stores structured data (objects, arrays, primitives parsed from JSON).
    *   **Resolution**: Resolved by `VariableReferenceResolver` using `StateService.getDataVar()`. Field/array access is handled within `VariableReferenceResolver.resolveFieldAccess`.
    *   **Constraints**: Supports dot notation for field and array index access.

## Core Resolution Pipeline (`VariableReferenceResolver`)

The `VariableReferenceResolver` is central to handling `{{...}}` references (Text and Data variables). Its process involves:

1.  **Parsing**: Input strings containing `{{...}}` are parsed into a sequence of `TextNode` and `VariableReferenceNode` instances. This identifies variable boundaries and field access paths. (See `parseContent`).
2.  **Iteration & Resolution**: The resolver iterates through the parsed nodes.
    *   For `TextNode`, the content is appended to the result.
    *   For `VariableReferenceNode`:
        *   The base variable name is extracted.
        *   `getVariable` is called to fetch the value from `StateService`, checking Text, then Data variables.
        *   If field access is present (`fields` property on the node), `resolveFieldAccess` is called recursively to traverse the data structure.
        *   The final resolved value is obtained.
3.  **String Conversion**: The resolved value (which could be a string, number, boolean, object, or array) is converted to a string using `convertToString` before being appended to the final output string.
4.  **Context Management**: A `ResolutionContext` is passed throughout, carrying flags like `strict` (error on missing variable vs. return empty), `depth` (for circularity checks), and potentially others like `allowedVariableTypes` or `isVariableEmbed`.

## Type Conversion and Formatting (`convertToString`)

A crucial and complex part of variable handling is converting the resolved value (potentially an object or array) into a string suitable for the output document.

*   **Simple Types**: Strings, numbers, booleans are converted directly. `null` and `undefined` become empty strings.
*   **Objects/Arrays**:
    *   **Inline Context** (e.g., within a line of text `Hello {{user}}`): The object/array is converted to a **compact JSON string** (e.g., `{"name":"A","id":1}`). Arrays become comma-space separated strings (`"apple, banana"`).
    *   **Block Context** (e.g., `@add {{user}}` on its own line): The object/array is converted to a **pretty-printed, indented JSON string**.
    *   **Field Access**: When accessing a specific field (`{{user.name}}`), the *value* of that field is converted using these rules.
*   **Formatting Context (`formattingContext`)**: The `convertToString` method accepts an optional context (`isBlock`, `nodeType`, `linePosition`, `isTransformation` [old name]) to determine whether to use inline or block formatting. The exact propagation and determination of this context through different directives and nesting levels is an area needing verification.
*   **Output Modes**: This formatting behavior is intrinsically linked to the concepts of "output-literal mode" vs. "output-normalized mode" discussed in Issue #19. Literal mode aims to preserve structure (potentially closer to block formatting?), while normalized mode aims for standard Markdown flow (potentially closer to inline formatting?). Ensuring consistency here is key.

## Key Challenges and Areas for Improvement

1.  **Formatting Consistency**:
    *   How reliably is the `formattingContext` determined and propagated across different directives (`@add`, `@run`, template literals within `@text`/`@data`) and nesting levels?
    *   Does the block vs. inline formatting distinction perfectly align with the "output-literal" vs. "output-normalized" modes? (See Issue #19).
    *   Are newline and spacing rules around resolved variables handled consistently, especially at directive boundaries?

2.  **Field Access Robustness**:
    *   The fallback of trying `JSON.parse` on a string value if direct field access fails within `accessFields` could mask issues or lead to unexpected behavior if a string *happens* to be valid JSON but wasn't intended as such.
    *   How are errors handled for invalid access (e.g., accessing a field on `null`, index out of bounds)? Is it consistent with `strict` mode?

3.  **Nested Variable Resolution**:
    *   The `resolveNestedVariableReference` logic seems complex with multiple fallbacks (injected service, client, direct resolution). Is this fully reliable, especially regarding context propagation and circular reference detection in nested scenarios?

4.  **Context (`ResolutionContext`) Management**:
    *   How are specific context flags like `allowedVariableTypes` (used to restrict resolution in specific directives) or `isVariableEmbed` (disabling path prefixing) consistently applied and passed down during complex resolutions?

5.  **Legacy Code/Types**:
    *   Are there remaining legacy variable types (`TextVar`, `DataVar` mentioned in comments/code) or resolution paths that might conflict with the primary `VariableReferenceResolver` logic?

## Validation Criteria

A robust variable system should ensure:
- Clear distinction and resolution paths for Path, Text, and Data variables.
- Consistent and predictable string conversion/formatting based on context (inline vs. block, literal vs. normalized output).
- Reliable field and array index access for Data variables with clear error handling.
- Correct propagation and application of `ResolutionContext` flags (`strict`, `depth`, etc.).
- Robust handling of nested variables and circular references.
- Consistent newline/spacing behavior around resolved variables in the final output. 