# Variable Resolution Requirements for Meld

## Core Resolution Context Requirements

1. **State Access**:
   - Resolution context must include `state: IStateService` for accessing variables
   - State service must provide typed access methods for different variable types (`text`, `data`, `path`)

2. **Resolution Mode Control**:
   - Context must include `strict: boolean` flag to control error behavior on missing variables/fields
   - Context should include `allowedVariableTypes` to restrict which variable types can be resolved

3. **Depth Control**:
   - Context must track `depth: number` to prevent infinite recursion
   - Maximum resolution depth must be configurable and enforced

4. **Path Context**:
   - Context should include `currentFilePath` for resolving path variables
   - Should support `disablePathPrefixing` flag for variable embeds

5. **Variable Embed Context**:
   - Must include `isVariableEmbed: boolean` flag to modify resolution behavior
   - Variable embeds should disable path prefixing by default

## Field Access Requirements

1. **Structured Field Path**:
   - Must support dot notation for object properties (`user.name`)
   - Must support array indexing with brackets (`items[0]`)
   - Must support numeric property access (`user.0.name`)

2. **Field Access Type Safety**:
   - Field access should validate property existence in strict mode
   - Array index access should validate array bounds in strict mode
   - Should provide descriptive errors for invalid field access

3. **Field Access Options**:
   - Context should include `preserveType` flag to maintain complex object structure
   - Should track `parentVariableName` for error reporting

## Type Conversion and Formatting

1. **Formatting Context**:
   - Must include `isBlock: boolean` for block vs. inline formatting
   - Should include `nodeType` and `linePosition` for context-aware formatting
   - Should support `isTransformationMode` flag for transformation-specific formatting

2. **Type Conversion Rules**:
   - Must convert objects/arrays to JSON with appropriate formatting
   - Should handle `null` and `undefined` values gracefully
   - Context should provide clear rules for string conversion of complex types

3. **Output Formatting Options**:
   - Block context should use pretty-printed JSON with indentation
   - Inline context should use compact JSON representation
   - Should support optional truncation with configurable max length

## Nested Resolution and Circularity

1. **Nested Variable References**:
   - Must support resolving variables within variable values
   - Should track resolution depth to prevent infinite recursion
   - Context should include `allowNested` flag to control nested resolution

2. **Circular Reference Detection**:
   - Must detect and handle circular references in variable values
   - Should provide clear error messages for circular reference detection
   - Should support a configurable maximum depth to prevent stack overflow

3. **Variable Reference Syntax**:
   - Must support `{{var}}` for text variables
   - Must support `{{var.field}}` for data variable field access
   - Should support legacy `${var}` syntax for backward compatibility
   - Must support `$var` for path variables

## Error Handling Requirements

1. **Structured Error Information**:
   - Errors should include variable name, field path, and expected/actual types
   - Should provide different error types based on failure reason (not found, invalid access, etc.)
   - Should respect `strict` mode for error vs. undefined behavior

2. **Resolution Fallbacks**:
   - Should support default values when variables are not found
   - Should provide graceful degradation in non-strict mode
   - Should allow configurable fallback behavior

## Type System Requirements

1. **Strongly Typed Variable Values**:
   - Variable values should use discriminated union types for type safety
   - Should provide type guards for safe type narrowing
   - Should maintain type information throughout the resolution process

2. **Context Type Safety**:
   - Resolution context should use proper TypeScript interfaces
   - Should eliminate type assertions with proper discriminated unions
   - Should provide builder pattern for creating valid contexts