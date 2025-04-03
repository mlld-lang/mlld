# Improving Type Safety for the `@embed` Directive in Meld

## Analysis of Current Implementation Issues

After reviewing the codebase, I've identified several key issues with the current `@embed` directive implementation in the DirectiveService:

### 1. Lack of Type Distinction Between Embed Variants

The current implementation treats all embed directives as a generic type, requiring runtime detection of the specific embed pattern being used. This leads to:

- Complex conditional logic in `handleEmbedDirective()`
- Potential for misinterpreting directive syntax
- No compile-time guarantees for directive parameter validity

### 2. Incomplete Embed Handler Implementation

The current `handleEmbedDirective()` method is incomplete and seems to reuse import directive logic, which doesn't correctly handle the three distinct embed types:
- File path embeds (`@embed [path/to/file]`)
- Variable embeds (`@embed {{variable}}`)
- Template embeds (`@embed [[template with {{variables}}]]`)

### 3. No Type-Safe Context for Resolution

The resolution context for variable embeds requires special flags (like `disablePathPrefixing`), but there's no type enforcement to ensure these are set correctly.

## Proposed TypeScript Type Improvements

### 1. Discriminated Union for Embed Directive Types

```typescript
/**
 * Base interface for all embed directive parameters
 */
export interface EmbedDirectiveParamsBase {
  kind: 'embed';
}

/**
 * Parameters for path-based embed directive: @embed [path/to/file]
 */
export interface EmbedPathDirectiveParams extends EmbedDirectiveParamsBase {
  embedType: 'path';
  path: string;
  section?: string;
  fuzzy?: number;
}

/**
 * Parameters for variable embed directive: @embed {{variable}}
 */
export interface EmbedVariableDirectiveParams extends EmbedDirectiveParamsBase {
  embedType: 'variable';
  variableReference: string;
  // No section or fuzzy parameters allowed for variable embeds
}

/**
 * Parameters for template embed directive: @embed [[template content]]
 */
export interface EmbedTemplateDirectiveParams extends EmbedDirectiveParamsBase {
  embedType: 'template';
  templateContent: string;
  // No section or fuzzy parameters allowed for template embeds
}

/**
 * Union type for all embed directive parameter types
 */
export type EmbedDirectiveParams = 
  | EmbedPathDirectiveParams 
  | EmbedVariableDirectiveParams 
  | EmbedTemplateDirectiveParams;
```

**Benefits:**
1. **Type Safety**: The parser can validate and categorize embed directives at parse time
2. **Exhaustive Checking**: TypeScript will ensure all embed types are handled
3. **Self-Documenting**: Makes the three distinct embed types explicit in the codebase
4. **Eliminates Runtime Pattern Matching**: No need for complex regex or string detection

### 2. Resolution Context Type for Variable Embeds

```typescript
/**
 * Resolution context specifically for variable embeds
 */
export interface VariableEmbedResolutionContext {
  currentFilePath: string;
  state: StateServiceLike;
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
  allowedVariableTypes: {
    text: true;
    data: true;
    path: false; // Path variables not allowed in variable embeds
  };
}

/**
 * Factory for creating properly configured resolution contexts
 */
export class ResolutionContextFactory {
  static forVariableEmbed(
    currentFilePath: string,
    state: StateServiceLike
  ): VariableEmbedResolutionContext {
    return {
      currentFilePath,
      state,
      isVariableEmbed: true,
      disablePathPrefixing: true,
      preventPathPrefixing: true,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: false
      }
    };
  }
}
```

**Benefits:**
1. **Enforced Configuration**: Ensures all required flags are set for variable embeds
2. **Prevents Mistakes**: Makes it impossible to forget critical settings like `disablePathPrefixing`
3. **Clear Intent**: Makes it obvious that variable embeds have special resolution requirements
4. **Factory Pattern**: Centralizes the creation of correctly configured contexts

### 3. Enhanced DirectiveNode Type for Embed Directives

```typescript
/**
 * Type guard to check if a directive is an embed directive
 */
export function isEmbedDirective(node: DirectiveNode): node is DirectiveNode & {
  directive: EmbedDirectiveParams;
} {
  return node.directive.kind === 'embed';
}

/**
 * Type guard to check if an embed directive is a path embed
 */
export function isPathEmbed(
  node: DirectiveNode & { directive: EmbedDirectiveParams }
): node is DirectiveNode & { directive: EmbedPathDirectiveParams } {
  return node.directive.embedType === 'path';
}

/**
 * Type guard to check if an embed directive is a variable embed
 */
export function isVariableEmbed(
  node: DirectiveNode & { directive: EmbedDirectiveParams }
): node is DirectiveNode & { directive: EmbedVariableDirectiveParams } {
  return node.directive.embedType === 'variable';
}

/**
 * Type guard to check if an embed directive is a template embed
 */
export function isTemplateEmbed(
  node: DirectiveNode & { directive: EmbedDirectiveParams }
): node is DirectiveNode & { directive: EmbedTemplateDirectiveParams } {
  return node.directive.embedType === 'template';
}
```

**Benefits:**
1. **Type Narrowing**: Allows TypeScript to narrow the type in conditional blocks
2. **Eliminates Type Assertions**: No need for unsafe type casting
3. **IDE Support**: Provides autocomplete for the correct properties of each embed type
4. **Error Prevention**: Catches property access errors at compile time

## Implementation Example

Here's how the improved `handleEmbedDirective` method would look with these type improvements:

```typescript
async handleEmbedDirective(
  node: DirectiveNode, 
  context: DirectiveContext
): Promise<DirectiveResult> {
  // Type guard ensures we're working with an embed directive
  if (!isEmbedDirective(node)) {
    throw new DirectiveError(
      'Not an embed directive',
      'embed',
      DirectiveErrorCode.VALIDATION_FAILED,
      { node }
    );
  }

  this.logger.debug('Processing embed directive', {
    embedType: node.directive.embedType,
    location: node.location
  });

  try {
    // Create a child state for the embed content
    const childState = context.state.createChildState();
    let content: string;

    // Type-safe handling based on embed type
    if (isPathEmbed(node)) {
      // Handle path embed
      content = await this.handlePathEmbed(node, context, childState);
    } 
    else if (isVariableEmbed(node)) {
      // Handle variable embed
      content = await this.handleVariableEmbed(node, context, childState);
    }
    else if (isTemplateEmbed(node)) {
      // Handle template embed
      content = await this.handleTemplateEmbed(node, context, childState);
    }
    else {
      // TypeScript ensures this is unreachable if all types are handled
      throw new DirectiveError(
        'Unknown embed type',
        'embed',
        DirectiveErrorCode.VALIDATION_FAILED,
        { node }
      );
    }

    // Create a text node replacement for transformation mode
    const replacement: TextNode = {
      type: 'Text',
      content,
      location: node.location
    };

    return {
      state: context.state,
      replacement,
      formattingContext: {
        isOutputLiteral: true,
        contextType: 'block'
      }
    };
  } catch (