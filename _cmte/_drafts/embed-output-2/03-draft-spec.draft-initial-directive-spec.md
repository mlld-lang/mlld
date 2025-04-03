# Proposed TypeScript Types for `@embed` Directive

Based on the comprehensive review of the Meld architecture and the consolidated feature requirements, I've drafted the following TypeScript type definitions for the `@embed` directive:

```typescript
/**
 * Base interface for all embed directive parameters.
 * Provides common properties and the discriminator for the union type.
 */
export interface EmbedDirectiveParamsBase {
  /** Identifies this as an embed directive */
  kind: 'embed';
}

/**
 * Represents a structured path with variable resolution information.
 * @remarks Chosen to align with existing path handling patterns while providing 
 * better type safety for variable interpolation.
 */
export interface StructuredPath {
  /** The original, unresolved path string */
  raw: string;
  
  /** The resolved path after variable substitution */
  resolved?: string;
  
  /** Information about variables within the path */
  variables?: Array<{
    /** Variable name without the $ prefix */
    name: string;
    /** Start position in the raw string */
    start: number;
    /** End position in the raw string */
    end: number;
  }>;
}

/**
 * Represents a reference to a variable with optional field access.
 * @remarks Consolidated from multiple proposals to provide a balance between
 * expressiveness and simplicity. Supports both dot notation and array indexing.
 */
export interface VariableReference {
  /** The variable name without braces */
  identifier: string;
  
  /** The type of variable being referenced */
  valueType?: 'text' | 'data' | 'path' | 'command';
  
  /** Array of field/property names or indices for nested access */
  fieldPath?: string[];
  
  /** Marker to identify this as a variable reference */
  isVariableReference: true;
}

/**
 * Parameters for path-based embed: @embed [path/to/file]
 * Used to embed raw content from a file path.
 */
export interface EmbedPathDirectiveParams extends EmbedDirectiveParamsBase {
  /** Discriminator for the embed type */
  embedType: 'path';
  
  /** The path to the file to embed */
  path: string | StructuredPath;
  
  /** Optional section identifier for partial file embedding */
  section?: string;
  
  /** Optional fuzzy matching tolerance for section matching */
  fuzzy?: number;
}

/**
 * Parameters for variable-based embed: @embed {{variable}}
 * Used to embed the value of a variable.
 */
export interface EmbedVariableDirectiveParams extends EmbedDirectiveParamsBase {
  /** Discriminator for the embed type */
  embedType: 'variable';
  
  /** The variable reference to embed */
  variableReference: VariableReference;
}

/**
 * Parameters for template-based embed: @embed [[template content]]
 * Used to embed a template with variables that are resolved at render time.
 */
export interface EmbedTemplateDirectiveParams extends EmbedDirectiveParamsBase {
  /** Discriminator for the embed type */
  embedType: 'template';
  
  /** The template content to embed */
  templateContent: string;
}

/**
 * Union type for all embed directive parameters.
 * @remarks Using a discriminated union pattern with embedType as the discriminator
 * provides compile-time type safety and eliminates the need for complex runtime type checking.
 */
export type EmbedDirectiveParams = 
  | EmbedPathDirectiveParams 
  | EmbedVariableDirectiveParams 
  | EmbedTemplateDirectiveParams;

/**
 * Type guard to check if a directive is an embed directive.
 * @param node The directive node to check
 * @returns True if the node is an embed directive
 */
export function isEmbedDirective(node: DirectiveNode): node is DirectiveNode & {
  directive: EmbedDirectiveParams;
} {
  return node?.directive?.kind === 'embed';
}

/**
 * Type guard for path embeds.
 * @param directive The embed directive parameters
 * @returns True if the directive is a path embed
 */
export function isPathEmbed(directive: EmbedDirectiveParams): directive is EmbedPathDirectiveParams {
  return directive.embedType === 'path';
}

/**
 * Type guard for variable embeds.
 * @param directive The embed directive parameters
 * @returns True if the directive is a variable embed
 */
export function isVariableEmbed(directive: EmbedDirectiveParams): directive is EmbedVariableDirectiveParams {
  return directive.embedType === 'variable';
}

/**
 * Type guard for template embeds.
 * @param directive The embed directive parameters
 * @returns True if the directive is a template embed
 */
export function isTemplateEmbed(directive: EmbedDirectiveParams): directive is EmbedTemplateDirectiveParams {
  return directive.embedType === 'template';
}

/**
 * Base resolution context interface.
 * @remarks Provides the foundation for specialized resolution contexts.
 */
export interface ResolutionContext {
  /** The current file path for relative path resolution */
  currentFilePath?: string;
  
  /** The state service for variable resolution */
  state: StateServiceLike;
  
  /** Configuration for which variable types are allowed */
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
}

/**
 * Specialized resolution context for variable embeds.
 * @remarks Critical for preventing path prefixing in variable embeds,
 * which was identified as a common source of bugs.
 */
export interface VariableEmbedResolutionContext extends ResolutionContext {
  /** Identifies this as a variable embed context */
  isVariableEmbed: true;
  
  /** Disables path prefixing for variable embeds */
  disablePathPrefixing: true;
  
  /** Additional safety flag to prevent path prefixing */
  preventPathPrefixing: true;
}

/**
 * Factory for creating properly configured resolution contexts.
 * @remarks The factory pattern ensures consistent configuration and
 * eliminates ad-hoc property checks throughout the code.
 */
export class ResolutionContextFactory {
  /**
   * Creates a resolution context specifically for variable embeds.
   * @param currentFilePath The current file path
   * @param state The state service
   * @returns A properly configured variable embed resolution context
   */
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
  
  /**
   * Creates a resolution context for template embeds.
   * @param currentFilePath The current file path
   * @param state The state service
   * @returns A properly configured template embed resolution context
   */
  static forTemplateEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): VariableEmbedResolutionContext {
    // Template embeds use the same context configuration as variable embeds
    return ResolutionContextFactory.forVariableEmbed(currentFilePath, state);
  }
  
  /**
   * Creates a standard resolution context for path embeds.
   * @param currentFilePath The current file path
   * @param state The state service
   * @returns A properly configured path embed resolution context
   */
  static forPathEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike
  ): ResolutionContext {
    return {
      currentFilePath,
      state,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,