# Consolidated Type Features for `@embed` Directive

After reviewing the proposals from various service leads, I've identified the most pragmatic and high-impact TypeScript type improvements for the `@embed` directive. These consolidated features will significantly enhance code safety, maintainability, and developer experience.

## Core Type Features

### 1. Discriminated Union for Embed Types

```typescript
// Base interface for all embed directive parameters
export interface EmbedDirectiveParamsBase {
  kind: 'embed';
}

// Path-based embed: @embed [path/to/file]
export interface EmbedPathDirectiveParams extends EmbedDirectiveParamsBase {
  embedType: 'path';
  path: string | StructuredPath;
  section?: string;
  fuzzy?: number;
}

// Variable-based embed: @embed {{variable}}
export interface EmbedVariableDirectiveParams extends EmbedDirectiveParamsBase {
  embedType: 'variable';
  variableReference: VariableReference;
}

// Template-based embed: @embed [[template content]]
export interface EmbedTemplateDirectiveParams extends EmbedDirectiveParamsBase {
  embedType: 'template';
  templateContent: string;
}

// Union type for all embed directive parameters
export type EmbedDirectiveParams = 
  | EmbedPathDirectiveParams 
  | EmbedVariableDirectiveParams 
  | EmbedTemplateDirectiveParams;
```

**Justification:** This was the most requested feature across all services. It eliminates complex runtime type checking, provides compile-time safety, and makes the code self-documenting. The discriminated union pattern aligns with Meld's architecture and will significantly simplify handler logic.

### 2. Type Guards for Embed Types

```typescript
// Type guard to check if a directive is an embed directive
export function isEmbedDirective(node: DirectiveNode): node is DirectiveNode & {
  directive: EmbedDirectiveParams;
} {
  return node.directive.kind === 'embed';
}

// Type guard for path embeds
export function isPathEmbed(directive: EmbedDirectiveParams): directive is EmbedPathDirectiveParams {
  return directive.embedType === 'path';
}

// Type guard for variable embeds
export function isVariableEmbed(directive: EmbedDirectiveParams): directive is EmbedVariableDirectiveParams {
  return directive.embedType === 'variable';
}

// Type guard for template embeds
export function isTemplateEmbed(directive: EmbedDirectiveParams): directive is EmbedTemplateDirectiveParams {
  return directive.embedType === 'template';
}
```

**Justification:** Type guards enable TypeScript's type narrowing, eliminating type assertions and making code more readable. They provide a consistent pattern for type checking across the codebase.

### 3. Structured Path and Variable Reference Types

```typescript
// Enhanced type for structured paths
export interface StructuredPath {
  raw: string;
  resolved?: string;
  variables?: Array<{
    name: string;
    start: number;
    end: number;
  }>;
}

// Enhanced type for variable references
export interface VariableReference {
  identifier: string;
  valueType?: 'text' | 'data' | 'path' | 'command';
  fieldPath?: string[];
  isVariableReference: true;
}
```

**Justification:** These types provide clear structure for path and variable references, making field/property access more reliable and eliminating complex string parsing. They were requested by multiple services and align with existing patterns in the codebase.

### 4. Embed-Specific Resolution Context

```typescript
// Base resolution context
export interface ResolutionContext {
  currentFilePath?: string;
  state: StateServiceLike;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  // Other common properties
}

// Context for variable embeds
export interface VariableEmbedResolutionContext extends ResolutionContext {
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
}

// Factory for creating properly configured contexts
export class ResolutionContextFactory {
  static forVariableEmbed(
    currentFilePath: string | undefined,
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
        path: false,  // Path variables not allowed in variable embeds
        command: true
      }
    };
  }
  
  // Other factory methods...
}
```

**Justification:** This feature prevents critical bugs related to path prefixing in variable embeds. The factory pattern ensures correct context configuration and eliminates ad-hoc property checks throughout the code.

## Implementation Benefits

These type improvements will provide several concrete benefits:

1. **Error Reduction**: Eliminates runtime type checking in favor of compile-time validation
2. **Self-Documenting Code**: Makes the three distinct embed types explicit in the type system
3. **Simplified Logic**: Replaces complex conditional checks with straightforward type-based dispatch
4. **IDE Support**: Provides better autocomplete and type checking in editors
5. **Refactoring Safety**: Makes it easier to modify embed handling code without introducing bugs

## Key Decisions and Trade-offs

1. **Chose `embedType` as Discriminator**: Selected `embedType` over alternatives like `type` or `kind` to avoid conflicts with existing properties. This provides a clear, embed-specific discriminator.

2. **Simplified Variable Reference Structure**: Consolidated several proposed variable reference formats into a single structure that balances expressiveness with simplicity.

3. **Focused on Core Types**: Prioritized the core type definitions that impact multiple services rather than including every proposed specialized type. This keeps the implementation pragmatic while still providing significant benefits.

4. **Factory Pattern for Contexts**: Adopted the factory pattern for resolution contexts to ensure consistent configuration, rather than relying on runtime property checks.

5. **Excluded Specialized Error Types**: While enhanced error types were proposed, they would require significant changes across the codebase. We'll focus on the core type improvements first and consider error enhancements in a future iteration.

These type improvements align with Meld's architecture and dependency injection approach, providing a solid foundation for safer and more maintainable code when working with the `@embed` directive.