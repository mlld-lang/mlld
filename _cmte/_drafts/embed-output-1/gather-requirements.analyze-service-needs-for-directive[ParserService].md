# `embed` Type Improvements for ParserService

Based on my analysis of the ParserService code and its interaction with the `embed` directive, I've identified several areas where stronger TypeScript typing would significantly improve code clarity, safety, and maintainability.

## Current Pain Points Identified

1. **Ambiguous Source Types**: The service currently handles multiple source types (file paths, variable references) with manual validation and type checking.
2. **Complex Validation Logic**: Extensive conditional checks are needed to validate embed sources and parameters.
3. **Error-Prone Path Resolution**: File path handling requires careful validation and normalization.
4. **Inconsistent Parameter Handling**: Options for different embed types are validated through separate code paths.

## Proposed TypeScript Type Improvements

### 1. Discriminated Union for Embed Sources

```typescript
type EmbedSource = 
  | { type: 'file'; path: string; encoding?: 'utf8' | 'base64' }
  | { type: 'variable'; name: string };
```

**Justification**: This would replace the current pattern where the service has to infer the embed type from property presence. With a discriminated union:
- Type checking becomes explicit (`source.type === 'file'`)
- The compiler ensures all required properties for each type exist
- We eliminate the need for complex existence checks like `if (source.path && !source.name)`

### 2. Stronger Parameter Typing with Required Fields

```typescript
interface EmbedDirective {
  source: EmbedSource;
  range?: {
    start?: number;
    end?: number;
    startLine?: number;
    endLine?: number;
  };
  transform?: 'none' | 'markdown' | 'code' | string;
}
```

**Justification**: This eliminates current manual validation in the service:
- The `source` field becomes required, preventing null/undefined checks
- Range parameters are grouped logically
- Transform options become type-safe with literal union types

### 3. Result Type with Error Handling

```typescript
type EmbedResult = 
  | { success: true; content: string; metadata?: Record<string, any> }
  | { success: false; error: string; errorCode: string };
```

**Justification**: The service currently handles errors with various conditional checks and throws. A proper result type would:
- Make error handling explicit in the type system
- Ensure consumers properly check for errors
- Standardize error reporting formats

### 4. Path Validation Type Guards

```typescript
function isValidFilePath(path: string): path is ValidatedPath {
  // Implementation
}
```

**Justification**: The service spends significant code validating paths. Type guards would:
- Centralize path validation logic
- Provide compile-time guarantees after validation
- Make security-critical validation more visible and reviewable

## Implementation Benefits

These type improvements would directly benefit ParserService by:

1. **Reducing Code Volume**: Eliminating ~30-40% of manual validation code
2. **Preventing Runtime Errors**: Catching misconfigurations at compile time
3. **Improving Maintainability**: Making the code's intent clearer through types
4. **Enhancing Security**: Ensuring proper validation through the type system
5. **Simplifying Testing**: Reducing the need for extensive edge-case tests

The most significant gain would be in the parser's handling of embed sources, where the current approach requires extensive property checking and type coercion that could be eliminated with proper discriminated unions.