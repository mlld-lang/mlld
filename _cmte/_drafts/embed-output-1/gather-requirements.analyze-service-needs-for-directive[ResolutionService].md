# Proposed TypeScript Type Improvements for the `embed` Directive

After examining the ResolutionService code and its interaction with the `embed` directive, I've identified several areas where stronger TypeScript typing could significantly improve code clarity, safety, and maintainability.

## 1. Discriminated Union for Embed Source Types

### Current Issue
The ResolutionService currently handles multiple types of sources for the `embed` directive (file paths, variable references, string literals, etc.) with complex conditional logic and type checking.

### Proposed Improvement
```typescript
type EmbedSource = 
  | { type: 'file'; path: string }
  | { type: 'variable'; reference: string }
  | { type: 'literal'; value: string }
  | { type: 'concatenation'; parts: EmbedSource[] };
```

### Justification
- **Simplifies resolver selection logic**: Instead of cascading if/else statements or complex type detection in the ContentResolver, we can use a simple switch on the `type` property.
- **Eliminates runtime type checking**: Much of the current code performs runtime validation that could be handled by the type system.
- **Improves error messages**: With distinct types, we can provide more precise error messages when an invalid source is provided.
- **Enforces valid combinations**: Prevents invalid combinations of properties that the current system must check manually.

## 2. Strong Return Type for Content Resolution

### Current Issue
The resolution process returns a variety of types that must be manually checked and coerced, leading to potential type errors and inconsistent handling.

### Proposed Improvement
```typescript
interface ResolvedEmbed {
  content: string;
  source: EmbedSource;
  metadata?: {
    filePath?: string;
    variableName?: string;
    originalExpression?: string;
  };
}
```

### Justification
- **Consistent return type**: All resolvers would return the same structured data type, eliminating the need for type checking and coercion.
- **Preserves context**: The metadata allows for better error reporting and debugging without complicating the core type.
- **Simplifies chaining**: When multiple resolution steps are needed, having a consistent type makes the code more predictable.

## 3. Error Type Specialization

### Current Issue
Error handling is inconsistent across resolvers, with different error types and structures being thrown in different situations.

### Proposed Improvement
```typescript
type EmbedResolutionError =
  | { kind: 'file_not_found'; path: string }
  | { kind: 'variable_not_found'; name: string }
  | { kind: 'invalid_content_type'; received: string }
  | { kind: 'resolution_failed'; source: EmbedSource; reason: string };
```

### Justification
- **Structured error handling**: Allows for precise error catching and handling based on the specific error type.
- **Improves error messages**: Can generate more helpful error messages with specific guidance based on the error type.
- **Better testing**: Makes it easier to test error conditions by asserting on specific error types.

## 4. Configuration Options Type

### Current Issue
The `embed` directive's configuration options are handled in an ad-hoc manner, with string parsing and manual validation.

### Proposed Improvement
```typescript
interface EmbedOptions {
  trim?: boolean;
  lineNumbers?: boolean;
  startLine?: number;
  endLine?: number;
  language?: string;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}
```

### Justification
- **Self-documenting**: Makes the available options explicitly clear in the code.
- **Validates at compile time**: Prevents invalid option combinations or unknown options.
- **Simplifies parsing**: Options can be directly parsed into this structure rather than handled individually.
- **Enables IDE support**: Developers get autocomplete and documentation for available options.

## 5. Context-Aware Resolution Type

### Current Issue
The resolution context is passed around as a generic object, making it difficult to ensure all needed properties are available.

### Proposed Improvement
```typescript
interface EmbedResolutionContext {
  currentFilePath: string;
  variables: Map<string, any>;
  basePath: string;
  fileSystem: FileSystemInterface;
}
```

### Justification
- **Ensures complete context**: Guarantees that all required context properties are provided.
- **Improves function signatures**: Makes it clear what context is required for resolution.
- **Prevents context errors**: Catches missing context properties at compile time rather than runtime.

## Implementation Benefits

These type improvements would significantly simplify several complex areas in the ResolutionService:

1. **ContentResolver.ts**: Could use type discrimination instead of complex detection logic.
2. **VariableReferenceResolver.ts**: Would have clearer typing for variable values and error handling.
3. **PathResolver.ts**: Could rely on stronger types for path normalization and resolution.
4. **Testing**: Would be more straightforward with consistent return and error types.

By implementing these type improvements, we would eliminate numerous edge cases, reduce the need for runtime type checking, and make the code more maintainable and self-documenting.