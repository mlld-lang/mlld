# CoreDirective Service Variable Handling Type Improvements

After analyzing the DirectiveService code, I've identified several areas where stronger TypeScript types could significantly improve variable handling. The current implementation has several areas that could benefit from more precise typing to reduce complexity, improve safety, and enhance maintainability.

## 1. Strongly Typed Resolution Context

### Current Issues
- The `resolutionContext` in `DirectiveContext` is typed as `any`, making it unclear what properties are available or required
- Resolution methods (`resolveText`, `resolveData`, `resolvePath`) all create similar context objects with duplicate code
- Error handling is inconsistent across resolution methods

### Proposed Solution
```typescript
// Define a clear interface for resolution context
export interface ResolutionContext {
  currentFilePath: string;
  workingDirectory: string;
  strict?: boolean;
  depth?: number;
  allowedVariableTypes?: Array<'text' | 'data' | 'path'>;
  isVariableEmbed?: boolean;
  state?: StateServiceLike;
}

// Update DirectiveContext to use this type
export interface DirectiveContext extends DirectiveContextBase {
  // Other properties...
  resolutionContext?: ResolutionContext;
  // Other properties...
}
```

### Benefits
1. **Type Safety**: Eliminates runtime errors from missing or incorrectly named properties
2. **Self-Documentation**: Makes it clear what options can be passed to resolution methods
3. **Consistency**: Ensures the same context structure is used across all resolution methods
4. **Code Reduction**: Removes duplicate context creation code in `resolveText`, `resolveData`, and `resolvePath`

## 2. Variable Type Discrimination Union

### Current Issues
- The `StateServiceLike` interface doesn't distinguish between variable types
- Methods like `setTextVar`, `setDataVar`, and `setPathVar` lack type safety for their values
- Type checking and conversions are done at runtime with potential for errors

### Proposed Solution
```typescript
// Define specific variable type interfaces
export interface TextVariable {
  type: 'text';
  value: string;
}

export interface DataVariable {
  type: 'data';
  value: any; // Could be further refined with JSON type
  schema?: JSONSchema; // Optional schema for validation
}

export interface PathVariable {
  type: 'path';
  value: string;
  resolved: boolean; // Whether the path has been fully resolved
}

// Union type for all variable types
export type MeldVariable = TextVariable | DataVariable | PathVariable;

// Update StateServiceLike to use these types
export interface StateServiceLike {
  // Instead of:
  // setTextVar(name: string, value: string): Promise<void>;
  // setDataVar(name: string, value: any): Promise<void>;
  // setPathVar(name: string, value: string): Promise<void>;
  
  // Use:
  setVariable(name: string, variable: MeldVariable): Promise<void>;
  getVariable(name: string, type?: 'text' | 'data' | 'path'): Promise<MeldVariable | undefined>;
  
  // Convenience methods with proper typing
  setTextVar(name: string, value: string): Promise<void>; // Internally calls setVariable
  setDataVar(name: string, value: any): Promise<void>; // Internally calls setVariable
  setPathVar(name: string, value: string): Promise<void>; // Internally calls setVariable
}
```

### Benefits
1. **Type Safety**: The type property ensures variables are used correctly
2. **Runtime Validation**: Enables validation at the time variables are set
3. **Unified Interface**: Provides a consistent pattern for all variable types
4. **Explicit Intent**: Makes the expected variable type clear in the code
5. **Error Prevention**: Reduces chances of using the wrong variable type in a context

## 3. Strongly Typed Formatting Context

### Current Issues
- The `formattingContext` property has a complex nested structure with optional fields
- Properties like `isOutputLiteral` and `contextType` are duplicated in both `DirectiveContext` and `DirectiveResult`
- The relationship between `formattingContext` and directive output is implicit

### Proposed Solution
```typescript
// Define a clear interface for formatting context
export interface FormattingContext {
  isOutputLiteral: boolean;
  contextType: 'inline' | 'block';
  nodeType: string;
  atLineStart?: boolean;
  atLineEnd?: boolean;
  parentContext?: FormattingContext;
}

// Update both interfaces to use this type
export interface DirectiveContext extends DirectiveContextBase {
  // Other properties...
  formattingContext?: FormattingContext;
  // Other properties...
}

export interface DirectiveResult {
  state: StateServiceLike;
  replacement?: MeldNode;
  formattingContext?: Partial<FormattingContext>;
}
```

### Benefits
1. **Consistency**: Ensures the same structure is used throughout the codebase
2. **Type Checking**: Catches errors when accessing or setting properties
3. **Self-Documentation**: Makes it clear what formatting options are available
4. **DRY Principle**: Eliminates duplicate type definitions
5. **Maintainability**: Changes to formatting options only need to be made in one place

## 4. Directive Handler Result Type Guard

### Current Issues
- The `processDirective` method has complex type checking logic to determine if a result is a `DirectiveResult` or `StateServiceLike`
- The check `if ('state' in result)` is error-prone and not type-safe
- The type narrowing doesn't fully propagate through the code

### Proposed Solution
```typescript
// Add a type guard function
export function isDirectiveResult(result: DirectiveResult | StateServiceLike): result is DirectiveResult {
  return typeof result === 'object' && result !== null && 'state' in result;
}

// Then in the processDirective method:
const result = await handler.execute(node, context);
if (isDirectiveResult(result)) {
  // TypeScript now knows result is DirectiveResult
  if (result.formattingContext && context.formattingContext) {
    Object.assign(context.formattingContext, result.formattingContext);
  }
  return result.state;
}
// TypeScript now knows result is StateServiceLike
return result;
```

### Benefits
1. **Type Safety**: Properly narrows the type for the rest of the function
2. **Self-Documentation**: Makes the intent of the check clear
3. **Reusability**: The type guard can be used throughout the codebase
4. **Maintainability**: If the DirectiveResult interface changes, only the type guard needs to be updated
5. **Error Prevention**: Eliminates potential runtime errors from incorrect type assumptions

## 5. Directive-Specific Variable Handling Types

### Current Issues
- Different directive handlers have different variable handling needs
- `handleTextDirective`, `handleDataDirective`, etc. all deal with variables differently
- Error handling for variable operations is inconsistent

### Proposed Solution
```typescript
// Define directive-specific variable interfaces
export interface TextDirectiveData {
  identifier: string;
  value: string;
}

export interface DataDirectiveData {
  identifier: string;
  value: any; // Could be refined with JSON type
  isJSON: boolean; // Whether the value is already parsed JSON
}

export interface PathDirectiveData {
  identifier: string;
  value: string;
  isAbsolute: boolean;
}

// Update the DirectiveNode type to include these
export interface DirectiveNode {
  type: 'Directive';
  directive: {
    kind: string;
    // Other common properties...
  } & (
    | { kind: 'text'; } & TextDirectiveData
    | { kind: 'data'; } & DataDirectiveData
    | { kind: 'path'; } & PathDirectiveData
    // Other directive types...
  );
  // Other properties...
}
```

### Benefits
1. **Type Safety**: Ensures each directive kind has the right properties
2. **Self-Documentation**: Makes it clear what properties each directive has
3. **Error Prevention**: Catches missing or incorrect properties at compile time
4. **IDE Support**: Provides better autocompletion and documentation
5. **Maintainability**: Makes it easier to add or modify directive properties

## 6. Resolution Method Return Type Refinement

### Current Issues
- The `resolveText`, `resolveData`, and `resolvePath` methods return different types but have similar signatures
- Error handling is duplicated across these methods
- The type of the resolved value isn't clear from the method signature

### Proposed Solution
```typescript
// Define a generic resolution result type
export interface ResolutionResult<T> {
  value: T;
  source: 'text' | 'data' | 'path' | 'none';
  resolved: boolean;
}

// Update the resolution methods
private async resolveText(text: string, context: DirectiveContext): Promise<ResolutionResult<string>> {
  // Implementation...
}

private async resolveData(ref: string, context: DirectiveContext): Promise<ResolutionResult<any>> {
  // Implementation...
}

private async resolvePath(path: string, context: DirectiveContext): Promise<ResolutionResult<string>> {
  // Implementation...
}
```

### Benefits
1. **Type Safety**: Makes the return type clear and consistent
2. **Error Handling**: Can include resolution status in the result
3. **Source Tracking**: Identifies where the value came from
4. **Self-Documentation**: Makes it clear what information is returned
5. **Consistency**: Provides a unified pattern for all resolution methods

## Implementation Priority and Impact

Based on the analysis, I recommend implementing these improvements in the following order:

1. **Strongly Typed Resolution Context** (High Impact) - This will immediately improve the clarity and safety of variable resolution throughout the codebase.

2. **Variable Type Discrimination Union** (High Impact) - This provides a foundation for safer variable handling and clearer type distinctions.

3. **Directive Handler Result Type Guard** (Medium Impact) - This improves type safety in a critical part of the directive processing pipeline.

4. **Strongly Typed Formatting Context** (Medium Impact) - This ensures consistent handling of formatting options across directive boundaries.

5. **Directive-Specific Variable Handling Types** (Medium Impact) - This improves type safety and documentation for directive handling.

6. **Resolution Method Return Type Refinement** (Lower Impact) - This provides better consistency and error handling for resolution methods.

These improvements will collectively make the CoreDirective service more robust, easier to maintain, and less prone to runtime errors related to variable handling.