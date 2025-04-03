# Improving the `@embed` Directive Type System

After analyzing the ContentResolver and related code, I've identified several opportunities to strengthen the type system for the `@embed` directive. These improvements will make the code more maintainable, reduce bugs, and eliminate manual validation.

## Current Implementation Analysis

The current ContentResolver is responsible for resolving content from nodes, but it has several limitations when handling the `@embed` directive:

1. It simply skips directive nodes without specialized handling for embedded content
2. There's no type-specific handling for the three distinct embed types (path, variable, template)
3. The StringLiteralHandler has complex validation logic that could be simplified with stronger types

## Proposed TypeScript Type Improvements

### 1. Create a Discriminated Union for Embed Types

```typescript
// Discriminated union with required discriminator field
type EmbedDirectiveParams = 
  | EmbedPathParams 
  | EmbedVariableParams 
  | EmbedTemplateParams;

// Path-based embed
interface EmbedPathParams {
  type: 'embedPath';  // Required discriminator
  path: string;       // Required path field
  options?: {         // Optional configuration
    trim?: boolean;
    encoding?: string;
  };
}

// Variable-based embed
interface EmbedVariableParams {
  type: 'embedVariable';  // Required discriminator
  variable: {             // Required variable reference
    name: string;         // Required variable name
    path?: string[];      // Optional property path (for object access)
    indices?: number[];   // Optional array indices (for array access)
  };
  options?: {             // Optional configuration
    format?: string;
  };
}

// Template-based embed
interface EmbedTemplateParams {
  type: 'embedTemplate';  // Required discriminator
  template: string;       // Required template content
  options?: {             // Optional configuration
    trimFirstNewline?: boolean;
  };
}
```

**Justification:**
1. **Eliminates type confusion**: The current code uses complex conditional logic to determine embed types. A discriminated union enforces type safety at compile time.
2. **Simplifies validation**: With distinct types, we can validate each embed type separately with type-specific rules.
3. **Reduces runtime errors**: Required fields ensure we always have the necessary data for each embed type.
4. **Improves developer experience**: TypeScript will provide autocomplete for the correct properties based on the embed type.

### 2. Add Strong Types for Variable References

```typescript
// Variable reference with support for property and array access
interface VariableReference {
  name: string;                  // Base variable name
  accessPath: AccessPathSegment[]; // Path to access nested properties/elements
}

// Discriminated union for access path segments
type AccessPathSegment = 
  | PropertyAccessSegment 
  | ArrayAccessSegment;

interface PropertyAccessSegment {
  type: 'property';
  name: string;
}

interface ArrayAccessSegment {
  type: 'arrayIndex';
  index: number;
}
```

**Justification:**
1. **Safer property access**: The StringLiteralHandler currently has complex logic for checking property access patterns. Typed structures would eliminate this complexity.
2. **Better error messages**: With structured data, we can provide more specific error messages about which part of the variable access failed.
3. **Consistent handling**: A structured approach ensures consistent handling of property and array access across the codebase.
4. **Documentation through types**: The types document the expected structure of variable references, making it easier for new developers to understand.

### 3. Create Resolution Context Type Extensions

```typescript
// Base resolution context
interface ResolutionContext {
  currentFilePath: string;
  state: IStateService;
  // ... other common properties
}

// Extended context for embed directives
interface EmbedResolutionContext extends ResolutionContext {
  embedType: 'path' | 'variable' | 'template';
  disablePathPrefixing: boolean;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
  };
}

// Factory function with specific return type
function createEmbedResolutionContext(
  baseContext: ResolutionContext, 
  embedType: 'path' | 'variable' | 'template'
): EmbedResolutionContext {
  // Implementation...
}
```

**Justification:**
1. **Context-specific behavior**: Different embed types need different resolution behaviors. Typed contexts ensure the correct behavior is applied.
2. **Prevents path prefixing errors**: The `disablePathPrefixing` flag is critical for variable embeds. Making it part of the type system ensures it's not forgotten.
3. **Clearer intent**: The type system documents which variable types are allowed in different contexts, making the code more self-documenting.
4. **Factory pattern support**: A strongly-typed factory function ensures contexts are created with the correct properties.

### 4. Add Content Type Annotations

```typescript
// Content type for embedded content
interface EmbeddedContent {
  content: string;
  contentType: 'text' | 'code' | 'markdown';
  source: 'file' | 'variable' | 'template';
  originalNode?: DirectiveNode;
}

// Return type for embed directive handlers
interface EmbedDirectiveResult {
  content: EmbeddedContent;
  childState?: IStateService;
}
```

**Justification:**
1. **Preserves content metadata**: The current implementation loses information about the content type, which affects rendering and processing.
2. **Enables format-specific handling**: With content type information, the OutputService can apply appropriate formatting.
3. **Traceability**: Keeping a reference to the original node helps with debugging and error reporting.
4. **Consistent interface**: A standardized return type for all embed handlers simplifies the calling code.

## Implementation Example

Here's how the ContentResolver could be updated to use these improved types:

```typescript
export class ContentResolver {
  constructor(
    private stateService: IStateService,
    @inject('IEmbedHandler') private embedHandler?: IEmbedHandler
  ) {}

  async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    const resolvedParts: string[] = [];

    for (const node of nodes) {
      if (node.type === 'Comment') {
        continue;
      }

      if (node.type === 'Directive' && 
          (node.directive as any)?.kind === 'embed' && 
          this.embedHandler) {
        // Use the strongly-typed embed handler
        const embedResult = await this.embedHandler.handleEmbed(
          node as DirectiveNode,
          context as EmbedResolutionContext
        );
        
        if (embedResult) {
          resolvedParts.push(embedResult.content.content);
        }
        continue;
      }

      switch (node.type) {
        case 'Text':
          resolvedParts.push((node as TextNode).content);
          break;
        case 'CodeFence':
          resolvedParts.push((node as CodeFenceNode).content);
          break;
      }
    }

    return resolvedParts
      .filter(part => part !== undefined)
      .join('');
  }
}
```

## Benefits Summary

These type improvements would provide significant benefits:

1. **Reduced complexity**: The complex conditional logic in the current code would be replaced with simple type-based dispatch.
2. **Better error handling**: Type-specific validation would catch errors earlier and provide better error messages.
3. **Self-documenting code**: The types themselves document the expected structure and behavior of the `@embed` directive.
4. **Improved maintainability**: With clear type boundaries, changes to one embed type won't accidentally affect others.
5. **Enhanced developer experience**: IDE features like autocomplete and type checking would make development more efficient.

By implementing these type improvements, the ContentResolver service would become more robust, easier to maintain, and less prone to bugs related to the `@embed` directive.