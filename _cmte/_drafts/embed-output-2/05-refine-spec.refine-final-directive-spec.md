Looking at all the feedback from service leads, I've refined the TypeScript types for the `@embed` directive to address the identified issues while maintaining a clean, consistent interface. Here's the final specification:

```typescript
/**
 * Base interface for all embed directive parameters.
 * Provides common properties and the discriminator for the union type.
 * @remarks Incorporates formatting options suggested by EmbedHandler service
 * and sourceLocation tracking from FileSystemCore service.
 */
export interface EmbedDirectiveParamsBase {
  /** Identifies this as an embed directive */
  kind: 'embed';
  
  /** Optional heading level for formatting embedded content */
  headingLevel?: string | number;
  
  /** Optional text to display under embedded content header */
  underHeader?: string;
  
  /** Whether to preserve original formatting in embedded content */
  preserveFormatting?: boolean;
  
  /** Source location information for error reporting */
  sourceLocation?: {
    filePath: string;
    line: number;
    column: number;
  };
  
  /** Transformation settings to propagate across service boundaries */
  transformOptions?: {
    enabled: boolean;
    includeDirectives?: boolean;
    removeEmptyLines?: boolean;
  };
}

/**
 * Represents a structured path with variable resolution information.
 * @remarks Aligned with existing PathInfo in ParserCore as suggested by ParserCore service.
 */
export interface StructuredPath {
  /** The original, unresolved path string */
  raw: string;
  
  /** The resolved path after variable substitution */
  resolved?: string;
  
  /** Result after resolution to store resolved value as suggested by ParserCore */
  result?: string;
  
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
 * @remarks Modified to include rawExpression and accessType as suggested by
 * VariableResolution service for consistency with existing field access implementation.
 */
export interface VariableReference {
  /** The variable name without braces */
  identifier: string;
  
  /** The original raw expression for error reporting */
  rawExpression: string;
  
  /** The type of variable being referenced */
  valueType?: 'text' | 'data' | 'path' | 'command';
  
  /** Array of field/property names or indices for nested access */
  fieldPath?: string[];
  
  /** Type of access (dot notation or bracket notation) */
  accessType?: 'dot' | 'bracket';
  
  /** Marker to identify this as a variable reference */
  isVariableReference: true;
  
  /** Result after resolution to store resolved value */
  resolvedValue?: any;
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
 * @remarks Includes throwOnError flag requested by VariableResolution service
 * and contextId suggested by StateCore service.
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
  
  /** Whether to throw errors or return undefined on resolution failures */
  throwOnError?: boolean;
  
  /** Unique identifier for tracking the resolution context throughout its lifecycle */
  contextId?: string;
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
 * @remarks Enhanced with fromDirectiveNode method as suggested by CoreDirective service
 * to further simplify handler code.
 */
export class ResolutionContextFactory {
  /**
   * Creates a resolution context specifically for variable embeds.
   * @param currentFilePath The current file path
   * @param state The state service
   * @param options Additional context options
   * @returns A properly configured variable embed resolution context
   */
  static forVariableEmbed(
    currentFilePath: string | undefined,
    state: StateServiceLike,
    options: Partial<ResolutionContext> = {}
  ): VariableEmbedResolutionContext