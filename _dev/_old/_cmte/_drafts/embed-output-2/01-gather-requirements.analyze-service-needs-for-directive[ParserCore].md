# Improving Type Safety for the `@embed` Directive in ParserCore

## Current Implementation Analysis

After reviewing the ParserService code in relation to the `@embed` directive, I've identified several areas where improved TypeScript types could significantly enhance code safety, maintainability, and clarity.

The current implementation has these key challenges:

1. **Variable reference handling is complex and error-prone** - The `transformVariableNode` method contains extensive type checking and manual property extraction
2. **Lack of discriminated union types** - The code uses type assertions (`as any`) in multiple places
3. **No specialized embed directive types** - The three distinct embed types (path, variable, template) aren't clearly represented in the type system
4. **Resolution context lacks embed-specific properties** - Special handling for variable embeds isn't typed

## Proposed TypeScript Type Improvements

### 1. Strong Discriminated Union for Embed Directive Types

```typescript
// Define a discriminated union for the three embed types
type EmbedDirectiveParams = 
  | EmbedPathDirective 
  | EmbedVariableDirective 
  | EmbedTemplateDirective;

// Path-based embed (file content)
interface EmbedPathDirective {
  type: 'embedPath';
  path: string;
  resolvedPath?: string;
}

// Variable-based embed
interface EmbedVariableDirective {
  type: 'embedVariable';
  variableReference: IVariableReference;
  resolvedValue?: string;
}

// Template-based embed with variables
interface EmbedTemplateDirective {
  type: 'embedTemplate';
  template: string;
  resolvedTemplate?: string;
}

// Directive node with strongly typed embed params
interface EmbedDirectiveNode extends DirectiveNode {
  kind: 'embed';
  directive: EmbedDirectiveParams;
}
```

**Justification:**
1. **Type Safety**: Eliminates manual type checking with `typeof` and property existence checks
2. **Self-documenting Code**: The types clearly express the three distinct embed behaviors
3. **Exhaustiveness Checking**: TypeScript can enforce handling all three cases in switch statements
4. **Simplified Validation**: Validation can be moved to the type level rather than runtime checks

### 2. Resolution Context for Embed Variables

```typescript
// Enhanced resolution context with embed-specific properties
interface ResolutionContext {
  currentFilePath: string;
  state: IStateService;
  // Embed-specific context properties
  embedContext?: {
    isVariableEmbed: boolean;
    disablePathPrefixing: boolean;
    allowedVariableTypes: {
      text: boolean;
      data: boolean;
      path: boolean;
    };
  };
}

// Factory for creating embed-specific contexts
class ResolutionContextFactory {
  static forVariableEmbed(filePath: string, state: IStateService): ResolutionContext {
    return {
      currentFilePath: filePath,
      state,
      embedContext: {
        isVariableEmbed: true,
        disablePathPrefixing: true,
        allowedVariableTypes: {
          text: true,
          data: true,
          path: false
        }
      }
    };
  }
}
```

**Justification:**
1. **Clearer Intent**: Makes the special handling for variable embeds explicit in the type system
2. **Error Prevention**: Prevents accidentally applying path prefixing to variable embeds
3. **Centralized Configuration**: Defines all embed-specific resolution behavior in one place
4. **Better Testability**: Makes it easier to verify correct context is used for each embed type

### 3. Enhanced Variable Reference Types for Embed Support

```typescript
// Enhanced variable reference with embed-specific properties
interface IVariableReference {
  type: 'VariableReference';
  identifier: string;
  valueType: 'text' | 'data' | 'path';
  fields?: Array<{ type: string; value: string }>;
  format?: string;
  location?: SourceLocation;
  // New properties for embed support
  isVariableReference: true;
  resolvedValue?: string;
  // Flag indicating this reference is used in an embed
  usedInEmbed?: boolean;
}

// Factory method enhancement
interface VariableNodeFactory {
  createVariableReferenceNode(
    identifier: string,
    valueType: 'text' | 'data' | 'path',
    fields?: Array<{ type: string; value: string }>,
    format?: string,
    location?: SourceLocation,
    options?: { usedInEmbed?: boolean }
  ): IVariableReference;
  
  isVariableReferenceNode(node: any): node is IVariableReference;
}
```

**Justification:**
1. **Context Awareness**: Allows variable references to "know" they're being used in an embed
2. **Consistent Resolution**: Ensures consistent handling across the codebase
3. **Simplified Transformation**: Makes the `transformVariableNode` method cleaner
4. **Reduced Casting**: Eliminates need for type assertions with the `as` operator

### 4. Type Guards for Embed Directive Detection

```typescript
// Type guards for safer type checking
function isEmbedDirectiveNode(node: MeldNode): node is EmbedDirectiveNode {
  return (
    node.type === 'Directive' && 
    'kind' in node && 
    node.kind === 'embed' &&
    'directive' in node
  );
}

function isEmbedPathDirective(directive: EmbedDirectiveParams): directive is EmbedPathDirective {
  return directive.type === 'embedPath';
}

function isEmbedVariableDirective(directive: EmbedDirectiveParams): directive is EmbedVariableDirective {
  return directive.type === 'embedVariable';
}

function isEmbedTemplateDirective(directive: EmbedDirectiveParams): directive is EmbedTemplateDirective {
  return directive.type === 'embedTemplate';
}
```

**Justification:**
1. **Type Narrowing**: Enables TypeScript to properly narrow types in conditional blocks
2. **Safer Access**: Eliminates potential undefined errors when accessing properties
3. **Self-documenting**: Makes the code intent clearer to other developers
4. **Refactoring Safety**: Helps catch errors during future refactoring

## Implementation in ParserService

Here's how these improvements would simplify the `transformVariableNode` method:

```typescript
private transformVariableNode(node: MeldNode): MeldNode {
  if (!node || typeof node !== 'object') {
    return node;
  }
  
  // Handle arrays
  if (Array.isArray(node)) {
    return node.map(item => this.transformVariableNode(item));
  }
  
  // Handle variable node types with type guard
  if (this.isOldStyleVariableNode(node)) {
    // Convert to new style with factory
    return this.variableNodeFactory.createVariableReferenceNode(
      this.getIdentifierFromNode(node),
      this.getValueTypeFromNode(node),
      node.fields || [],
      node.format,
      node.location
    );
  }
  
  // Handle embed directive nodes
  if (isEmbedDirectiveNode(node)) {
    const directive = node.directive;
    
    // Use type narrowing for each embed type
    if (isEmbedVariableDirective(directive) && directive.variableReference) {
      // Handle variable reference in embed
      directive.variableReference.usedInEmbed = true;
    } 
    else if (isEmbedTemplateDirective(directive)) {
      // Process template content
      // Template variables will be handled during resolution
    }
    
    return node;
  }
  
  // Process directive nodes that might contain variable references
  if (node.type === 'Directive' && 'directive' in node) {
    const transformedDirective = { ...node.directive };
    
    // Transform properties that might contain variable references
    if (transformedDirective.value && typeof transformedDirective.value === 'object') {
      transformedDirective.value = this.transformVariableNode(transformedDirective