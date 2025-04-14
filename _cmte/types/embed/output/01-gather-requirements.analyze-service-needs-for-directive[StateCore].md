# Improving `@embed` Directive Type Safety in StateCore

## Current Challenges in the StateCore Service

After analyzing the StateCore service implementation, I've identified several areas where improved TypeScript typing for the `@embed` directive would significantly enhance code safety, maintainability, and clarity. The current implementation has the following challenges:

### 1. Variable Type Safety Issues

The StateCore service currently handles different types of variables (text, data, path) with separate maps, but the `hasVariable` method uses string literals for type checking:

```typescript
hasVariable(type: string, name: string): boolean {
  switch (type.toLowerCase()) {
    case 'text':
      return this.getTextVar(name) !== undefined;
    case 'data':
      return this.getDataVar(name) !== undefined;
    case 'path':
      return this.getPathVar(name) !== undefined;
    default:
      return false;
  }
}
```

This approach is error-prone as it relies on string literals and manual validation.

### 2. Ambiguous Embed Content Handling

The StateCore service doesn't have explicit types for distinguishing between different `@embed` content types (file content vs. variable content). This leads to complexity in directive handlers that must manually determine the embed type:

```typescript
// Example of what directive handlers must do currently
if (typeof content === 'string' && content.startsWith('{{') && content.endsWith('}}')) {
  // Handle variable embed
} else if (typeof content === 'string' && content.startsWith('[[') && content.endsWith(']]')) {
  // Handle template embed
} else {
  // Handle path embed
}
```

### 3. Transformation Safety Concerns

The `transformNode` method has complex logic for finding and replacing nodes:

```typescript
transformNode(original: MeldNode, transformed: MeldNode): void {
  // Complex logic to find the node by reference or location
  // ...
}
```

Without proper type validation, transformed content from `@embed` directives could be incorrectly processed.

## Proposed TypeScript Type Improvements

### 1. Discriminated Union for Variable Types

```typescript
// Define a discriminated union for variable types
type VariableType = 
  | { type: 'text'; value: string }
  | { type: 'data'; value: unknown }
  | { type: 'path'; value: string };

// Update the interface
interface IStateService extends StateServiceBase {
  // Replace string-based type parameter with strongly-typed enum
  hasVariable(type: 'text' | 'data' | 'path', name: string): boolean;
  
  // New method that returns the properly typed value
  getVariableWithType(type: 'text' | 'data' | 'path', name: string): VariableType | undefined;
}
```

**Justification**: This eliminates the risk of using invalid variable types and provides proper type checking at compile time. It also enables better IDE autocompletion and documentation. The current string-based approach is prone to typos and requires manual validation.

### 2. Embed Content Type Discrimination

```typescript
// Define specific embed content types
type EmbedContent = 
  | { kind: 'file'; path: string }
  | { kind: 'variable'; variableName: string; accessPath?: string[] }
  | { kind: 'template'; content: string; variables: string[] };

// Add new methods to StateService for embed-specific operations
interface IStateService extends StateServiceBase {
  // Method to validate embed content type
  validateEmbedContent(content: unknown): EmbedContent | undefined;
  
  // Method to resolve embed content based on type
  resolveEmbedContent(content: EmbedContent): Promise<string>;
}
```

**Justification**: This provides clear type discrimination for the three different `@embed` content types, making it impossible to misinterpret an embed's intent. It eliminates complex conditional logic in directive handlers and provides compile-time checking of embed parameter types. The current approach requires runtime checks and complex pattern matching.

### 3. Transformation Node Types for Embed Results

```typescript
// Define specific node transformation types for embeds
interface EmbedTransformationResult {
  originalNode: MeldNode;
  transformedContent: string;
  sourceType: 'file' | 'variable' | 'template';
  metadata?: {
    sourceFile?: string;
    variableName?: string;
    templateVariables?: string[];
  };
}

// Extend the StateService interface
interface IStateService extends StateServiceBase {
  // Specialized method for embed transformations
  transformEmbedNode(result: EmbedTransformationResult): void;
}
```

**Justification**: This creates a specialized transformation path for embed directives, preserving important metadata about the source of embedded content. It simplifies the complex node finding logic in `transformNode` by providing clear context about the transformation. The current approach loses this context information, making debugging and tracking more difficult.

### 4. Strongly-Typed Embed Options

```typescript
// Define specific options for each embed type
interface EmbedFileOptions {
  trim?: boolean;
  lineNumbers?: boolean;
}

interface EmbedVariableOptions {
  format?: 'text' | 'json' | 'markdown';
  fallback?: string;
}

interface EmbedTemplateOptions {
  escapeHtml?: boolean;
  preserveWhitespace?: boolean;
}

// Combined options type with discriminated union
type EmbedOptions = 
  | { kind: 'file'; options: EmbedFileOptions }
  | { kind: 'variable'; options: EmbedVariableOptions }
  | { kind: 'template'; options: EmbedTemplateOptions };

// Update the state service interface
interface IStateService extends StateServiceBase {
  // Store embed-specific options
  setEmbedOptions(nodeId: string, options: EmbedOptions): void;
  getEmbedOptions(nodeId: string): EmbedOptions | undefined;
}
```

**Justification**: This provides type-safe options that are specific to each embed type, preventing mismatches like trying to use a file-specific option with a variable embed. It also enables better documentation and IDE support for available options. The current approach would need to validate options at runtime with complex conditional logic.

## Implementation Benefits

These type improvements would provide significant benefits to the StateCore service:

1. **Error Reduction**: Catch type mismatches at compile time rather than runtime
2. **Self-Documenting Code**: Clear types express intent and valid usage patterns
3. **Simplified Logic**: Replace complex conditional checks with type-driven code
4. **Better IDE Support**: Enhanced autocompletion and inline documentation
5. **Maintainability**: Types enforce consistent handling across the codebase
6. **Testing**: Easier to mock and test with precise types

## Example Implementation

Here's how the updated `hasVariable` method would look with the improved types:

```typescript
// With discriminated union
hasVariable(type: 'text' | 'data' | 'path', name: string): boolean {
  switch (type) {
    case 'text':
      return this.getTextVar(name) !== undefined;
    case 'data':
      return this.getDataVar(name) !== undefined;
    case 'path':
      return this.getPathVar(name) !== undefined;
  }
}
```

And here's how embed content resolution would be simplified:

```typescript
// With discriminated union for embed content
async resolveEmbedContent(content: EmbedContent): Promise<string> {
  switch (content.kind) {
    case 'file':
      return await this.filesystem.readFile(content.path);
    case 'variable':
      const variable = this.getVariableWithType(
        'text', 
        content.variableName
      );
      return variable ? variable.value : '';
    case 'template':
      return this.resolveTemplateVariables(content.content, content.variables);
  }
}
```

## Conclusion

Implementing these TypeScript type improvements for the `@embed` directive would significantly enhance the StateCore service by making it more type-safe, self-documenting, and maintainable. The proposed discriminated unions and specialized types align perfectly with the three distinct `@embed` directive syntaxes (file path, variable reference, and template content), ensuring that each is handled correctly and safely throughout the codebase.

These improvements would eliminate the need for complex conditional logic and string-based type checking, reducing the risk of bugs and making the code more robust against future changes. The explicit typing would also serve as documentation, making it easier for developers to understand and correctly use the `@embed` directive functionality.