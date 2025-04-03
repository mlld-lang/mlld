# `embed` Type Improvements for InterpreterService

After examining the InterpreterService code that interacts with the `embed` directive, I've identified several areas where stronger TypeScript types would significantly improve code clarity, safety, and maintainability.

## Current Complexities and Proposed Solutions

### 1. Source Type Validation

**Current Issue:**
The service currently handles multiple source types (file paths, variable references) with manual validation and string parsing, creating complexity and potential for errors.

```typescript
// Current approach requires manual validation
if (typeof source === 'string') {
  if (source.startsWith('$')) {
    // Handle variable reference
  } else {
    // Handle file path
  }
}
```

**Proposed Type Improvement:**
```typescript
type EmbedSource = 
  | { type: 'file'; path: string }
  | { type: 'variable'; name: string };
```

**Justification:** 
This discriminated union would eliminate manual string parsing and validation. The InterpreterService would receive pre-validated sources with clear intent, reducing conditional logic and error-prone string operations. This would directly simplify the content resolution logic in the service.

### 2. Content Format Options

**Current Issue:**
The service contains complex conditional logic to handle different formatting options that are currently passed as untyped strings or objects.

**Proposed Type Improvement:**
```typescript
type EmbedFormatOptions = {
  language?: string;
  startLine?: number;
  endLine?: number;
  highlight?: number[];
  removeComments?: boolean;
  trim?: boolean;
};
```

**Justification:**
With properly typed format options, the InterpreterService would benefit from automatic type checking, eliminating manual validation code. This would make the formatting logic more maintainable and less prone to errors when new options are added.

### 3. Error Handling Specificity

**Current Issue:**
Error handling is generic, making it difficult to provide specific error messages for different failure modes (file not found, variable undefined, permission issues).

**Proposed Type Improvement:**
```typescript
type EmbedError =
  | { kind: 'file_not_found'; path: string }
  | { kind: 'variable_undefined'; name: string }
  | { kind: 'permission_denied'; path: string }
  | { kind: 'invalid_format'; details: string };
```

**Justification:**
This would allow the InterpreterService to generate more precise error messages and enable consumers to handle different error types appropriately. It would also make unit testing more straightforward by allowing tests to verify specific error conditions.

### 4. Complete Embed Directive Type

**Current Issue:**
The complete embed directive structure lacks strong typing, leading to inconsistent property access and validation.

**Proposed Type Improvement:**
```typescript
interface EmbedDirective {
  source: EmbedSource;
  format?: EmbedFormatOptions;
  fallback?: string;
  maxLength?: number;
}
```

**Justification:**
A comprehensive type for the entire directive would ensure consistent property access throughout the InterpreterService. This would reduce null/undefined checks and simplify the implementation of features like fallback content and length limitations.

## Benefits to InterpreterService

1. **Reduced Conditional Logic**: The proposed types would eliminate many if/else chains currently needed for type checking and validation.

2. **Self-Documenting Code**: The types clearly express the expected structure and constraints of embed directives, making the code more readable.

3. **Earlier Error Detection**: Type errors would be caught at compile-time rather than runtime.

4. **Simplified Testing**: With strongly typed inputs and outputs, unit tests can focus on business logic rather than edge cases in type handling.

5. **Improved Maintainability**: New developers would understand the expected data structures without having to trace through implementation details.

By implementing these type improvements, the InterpreterService would become more robust while actually reducing the amount of code needed for validation and error handling.