# Improving TypeScript Types for @embed Directive in ParserCore

After analyzing the code for the ParserCore service, I've identified several areas where we can improve the TypeScript type system for the `@embed` directive. The current implementation lacks strong typing for the different embed subtypes, which leads to complexity in validation and edge case handling.

## Current Implementation Challenges

The ParserService currently has these challenges related to the `@embed` directive:

1. **No Type Differentiation**: The code doesn't have specific types for the three distinct embed syntaxes (path, variable, template).

2. **Manual Property Checking**: The `transformVariableNode` method has to manually check properties and perform type assertions.

3. **Missing Embed-Specific Validation**: There's no specialized validation for embed directive constraints like newline restrictions.

4. **Inconsistent Variable Reference Handling**: The code has to handle variable references differently depending on context.

## Proposed Type Improvements

### 1. Discriminated Union for Embed Directive Types

```typescript
// Base interface for all embed directives
interface EmbedDirectiveBase {
  kind: 'embed';
  embedType: 'path' | 'variable' | 'template';
}

// Path-based embed: @embed [path/to/file]
interface EmbedPathDirective extends EmbedDirectiveBase {
  embedType: 'path';
  path: string;
  // Path embeds can't have newlines
  allowsNewlines: false;
}

// Variable-based embed: @embed {{variable}}
interface EmbedVariableDirective extends EmbedDirectiveBase {
  embedType: 'variable';
  variableReference: IVariableReference;
  // Variable embeds can't have newlines
  allowsNewlines: false;
}

// Template-based embed: @embed [[template with {{variables}}]]
interface EmbedTemplateDirective extends EmbedDirectiveBase {
  embedType: 'template';
  templateContent: string;
  // Only template embeds can have newlines
  allowsNewlines: true;
  // Flag to indicate first newline should be ignored
  ignoreFirstNewline: boolean;
}

// Union type for all embed directive types
type EmbedDirective = 
  | EmbedPathDirective 
  | EmbedVariableDirective 
  | EmbedTemplateDirective;
```

**Benefits:**
1. **Type Safety**: The discriminated union with the `embedType` property allows TypeScript to correctly narrow types in conditionals.
2. **Self-Documenting**: Each subtype clearly defines its purpose and constraints.
3. **Validation Built-In**: Properties like `allowsNewlines` make constraints explicit in the type system.

### 2. Enhanced Variable Reference Type

```typescript
interface IVariableReference {
  type: 'VariableReference';
  identifier: string;
  valueType: 'text' | 'data' | 'path';
  fields?: Array<{value: string}>;
  // Explicit flag for variable references
  isVariableReference: true;
  // Optional resolved value
  resolvedValue?: string;
  // Flag to prevent path prefixing in embed context
  disablePathPrefixing?: boolean;
}
```

**Benefits:**
1. **Context-Aware Processing**: The `disablePathPrefixing` flag helps the resolution service understand when a variable is used in an embed context.
2. **Explicit Type Checking**: The `isVariableReference` flag makes type guards simpler and more reliable.
3. **Resolution Tracking**: The optional `resolvedValue` property provides a place to store resolution results.

### 3. Structured EmbedDirectiveParams

```typescript
interface EmbedDirectiveParams {
  // Common properties
  kind: 'embed';
  
  // For path embeds
  path?: string | IVariableReference;
  
  // For variable embeds
  variableReference?: IVariableReference;
  
  // For template embeds
  isTemplateContent?: boolean;
  content?: string;
  
  // Validation helpers
  hasNewlines?: boolean;
}
```

**Benefits:**
1. **Structured Validation**: Makes it easier to validate the directive parameters.
2. **Clear Property Access**: Provides clear property paths for accessing different types of embed content.
3. **Validation Hints**: Properties like `hasNewlines` help validate constraints without complex parsing.

## Implementation Impact

Here's how these type improvements would simplify the current code:

### 1. Simplified Subtype Detection

```typescript
private determineEmbedType(node: DirectiveNode): 'path' | 'variable' | 'template' {
  // With the discriminated union, this becomes trivial
  const embedDirective = node.directive as EmbedDirective;
  return embedDirective.embedType;
}
```

### 2. Streamlined Variable Reference Handling

```typescript
// Current complex code:
if (transformedDirective.value && typeof transformedDirective.value === 'object') {
  transformedDirective.value = this.transformVariableNode(transformedDirective.value);
}

// With improved types:
if (isVariableReference(transformedDirective.value)) {
  // TypeScript knows this is an IVariableReference
  transformedDirective.value = this.transformVariableNode(transformedDirective.value);
}
```

### 3. Enhanced Validation

```typescript
// With the new types, validation becomes more straightforward
private validateEmbedDirective(directive: EmbedDirective): void {
  // TypeScript automatically narrows the type based on embedType
  if (directive.embedType === 'path' || directive.embedType === 'variable') {
    if (directive.content?.includes('\n')) {
      throw new MeldParseError(
        `Newlines are not allowed in ${directive.embedType} embeds`
      );
    }
  }
  
  if (directive.embedType === 'template') {
    // Template-specific validation
  }
}
```

## Conclusion

Implementing these type improvements would provide significant benefits:

1. **Reduced Complexity**: The code would be simpler with fewer type assertions and manual property checks.

2. **Better Error Prevention**: The type system would catch more errors at compile time rather than runtime.

3. **Self-Documenting Code**: The types themselves would document the constraints and behaviors of each embed type.

4. **Improved Maintainability**: Future changes would be safer as the type system would guide developers through the required properties for each embed type.

5. **Cleaner Directive Handler**: The EmbedDirectiveHandler would benefit from clearer type distinctions, making it easier to implement the different behaviors for each embed type.

These improvements align perfectly with the Meld language's goal of providing a clear, directive-based scripting language while maintaining type safety and robust error handling.