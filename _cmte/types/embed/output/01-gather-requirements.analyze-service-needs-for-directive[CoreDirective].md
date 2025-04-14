# Improving TypeScript Types for the `@embed` Directive

After analyzing the CoreDirective service code, I've identified several opportunities to enhance the type system for the `@embed` directive. The current implementation shows complexity in handling different embed types that could be significantly simplified with stronger type definitions.

## Current Implementation Issues

The current `handleEmbedDirective` method has several limitations:

1. It treats all embed directives as file path embeds, lacking proper type discrimination
2. It doesn't distinguish between the three distinct embed types (path, variable, template)
3. It lacks proper context-specific resolution options for variable embeds
4. Manual validation and string manipulation is required to detect embed types

## Proposed Type Improvements

### 1. Discriminated Union for Embed Types

```typescript
// Define a discriminated union for the three embed types
type EmbedDirectiveParams = 
  | EmbedPathDirective 
  | EmbedVariableDirective 
  | EmbedTemplateDirective;

// Base interface with common properties
interface BaseEmbedDirective {
  kind: 'embed';
  location?: SourceLocation;
}

// Path-based embed (files)
interface EmbedPathDirective extends BaseEmbedDirective {
  embedType: 'path';
  path: string;
  section?: string;
  fuzzy?: number;
}

// Variable-based embed
interface EmbedVariableDirective extends BaseEmbedDirective {
  embedType: 'variable';
  variableReference: string;
  accessPath?: string[]; // For property access
}

// Template-based embed
interface EmbedTemplateDirective extends BaseEmbedDirective {
  embedType: 'template';
  template: string;
  ignoreFirstNewline?: boolean;
}
```

**Justification:** 
- This discriminated union provides compile-time type safety when working with different embed types
- Eliminates the need for manual type detection through string pattern matching
- Clearly documents the three distinct embed syntaxes in the type system
- Enables exhaustive switch/case handling with TypeScript's type narrowing

### 2. Resolution Context Type for Variable Embeds

```typescript
interface VariableEmbedResolutionContext extends ResolutionContext {
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
  allowedVariableTypes: {
    text: true;
    data: true;
    path: false; // Path variables not allowed in variable embeds
  };
}

// Factory function type
interface ResolutionContextFactory {
  forVariableEmbed(
    currentFilePath: string,
    state: StateServiceLike
  ): VariableEmbedResolutionContext;
  
  // Other factory methods...
}
```

**Justification:**
- Encodes the special resolution rules for variable embeds directly in the type system
- Prevents accidental path prefixing in variable embeds (a common source of bugs)
- Makes the variable embed resolution constraints explicit and self-documenting
- Reduces the risk of misconfiguration when creating resolution contexts

### 3. Template-Specific Processing Types

```typescript
interface TemplateProcessingOptions {
  removeFirstNewline: boolean;
  variableContext: VariableEmbedResolutionContext;
}

interface ProcessedTemplate {
  content: string;
  childState: StateServiceLike;
}
```

**Justification:**
- Explicitly models the template processing behavior in the type system
- Documents the special handling for the first newline in templates
- Creates a clear contract for template processing functions
- Makes the template-specific behaviors visible at the API level

### 4. Embed Handler Result Type

```typescript
interface EmbedDirectiveResult extends DirectiveResult {
  // Common fields from DirectiveResult
  state: StateServiceLike;
  replacement?: MeldNode;
  
  // Embed-specific fields
  embedType: 'path' | 'variable' | 'template';
  content: string;
  source?: 'file' | 'variable' | 'template';
  resolvedFrom?: string; // Path or variable reference that was resolved
}
```

**Justification:**
- Provides rich metadata about the embed operation for debugging and tracing
- Enables specialized handling in the transformation pipeline based on embed type
- Improves error messages by capturing the source of embedded content
- Facilitates testing by making embed operations more transparent

### 5. Improved Error Types for Embed-Specific Failures

```typescript
enum EmbedErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_VARIABLE_REFERENCE = 'INVALID_VARIABLE_REFERENCE',
  TEMPLATE_SYNTAX_ERROR = 'TEMPLATE_SYNTAX_ERROR',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED'
}

interface EmbedDirectiveError extends MeldDirectiveError {
  code: EmbedErrorCode;
  embedType: 'path' | 'variable' | 'template';
  details?: {
    attemptedPath?: string;
    variableReference?: string;
    template?: string;
    cause?: Error;
  };
}
```

**Justification:**
- Provides structured error information specific to embed operations
- Enables more targeted error handling and recovery
- Improves error messages with context about what type of embed failed
- Makes debugging easier by preserving details about the attempted operation

## Implementation Benefits

These type improvements would significantly enhance the `EmbedDirectiveHandler` by:

1. **Eliminating manual type detection code** - The discriminated union removes the need for string pattern matching

2. **Preventing common errors** - Specialized resolution contexts prevent path prefixing in variable embeds

3. **Improving code readability** - Types document the different embed behaviors directly in the code

4. **Enabling better error messages** - Structured error types provide more context about failures

5. **Simplifying testing** - Result types with metadata make assertions more precise

## Example Implementation

Here's how the refactored `execute` method in `EmbedDirectiveHandler` could look with these improved types:

```typescript
async execute(
  node: DirectiveNode,
  context: DirectiveContext
): Promise<EmbedDirectiveResult> {
  // The type system already knows which kind of embed we're dealing with
  const directive = node.directive as EmbedDirectiveParams;
  
  // Type narrowing through discriminated union
  switch (directive.embedType) {
    case 'path':
      return this.handlePathEmbed(directive, context);
      
    case 'variable':
      return this.handleVariableEmbed(directive, context);
      
    case 'template':
      return this.handleTemplateEmbed(directive, context);
  }
}
```

## Conclusion

The proposed type improvements would transform the `@embed` directive handling from complex, string-based detection logic to a type-safe, self-documenting implementation. By leveraging TypeScript's discriminated unions and specialized context types, we can make the code more maintainable, reduce bugs, and improve the developer experience when working with embed directives.

These changes align with the architectural principles of the Meld codebase, particularly the interface-first design pattern and clear separation of concerns between different directive types.