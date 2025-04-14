Based on the documentation and requirements, I'll create a TypeScript type proposal for the `@embed` directive.

```typescript
/**
 * Defines the types of embed directives supported by Meld.
 * 
 * @remarks
 * Three distinct embed types are supported, each with specific behavior:
 * - path: embeds raw content from a file
 * - variable: embeds the value of a variable
 * - template: embeds a template with variables resolved at render time
 */
export enum EmbedType {
  PATH = 'path',
  VARIABLE = 'variable',
  TEMPLATE = 'template'
}

/**
 * Base interface for all embed directive parameters.
 * Contains common properties shared across all embed types.
 * 
 * @remarks
 * Using a discriminated union pattern with embedType as the discriminator
 * to enable type narrowing and exhaustive checks.
 */
export interface BaseEmbedParams {
  /** Discriminator field to determine the specific embed type */
  embedType: EmbedType;
  
  /** Optional section name to target within the embedded content */
  section?: string;
  
  /** Optional heading level to target (1-6 for h1-h6) */
  headingLevel?: number;
  
  /** Target content under a specific header */
  underHeader?: string;
  
  /** Enable fuzzy section matching (boolean or string pattern) */
  fuzzy?: boolean | string;
  
  /** Preserve whitespace and formatting in the embedded content */
  preserveFormatting?: boolean;
  
  /** Source location information for error reporting */
  sourceLocation?: SourceLocation;
}

/**
 * Parameters specific to path-based embeds.
 * 
 * @remarks
 * Path embeds load raw content from a file path.
 * The file content is never interpreted as Meld syntax.
 */
export interface PathEmbedParams extends BaseEmbedParams {
  embedType: EmbedType.PATH;
  
  /** Path to the file to embed */
  path: string;
  
  /** File encoding (defaults to UTF-8) */
  encoding?: string;
  
  // TODO: Runtime validation to ensure path exists and is within allowed boundaries
}

/**
 * Parameters specific to variable-based embeds.
 * 
 * @remarks
 * Variable embeds insert the value of a variable.
 * The variable content is never treated as a path.
 */
export interface VariableEmbedParams extends BaseEmbedParams {
  embedType: EmbedType.VARIABLE;
  
  /** The variable reference to embed */
  variable: VariableReference;
  
  // TODO: Runtime validation to ensure variable exists
}

/**
 * Parameters specific to template-based embeds.
 * 
 * @remarks
 * Template embeds insert a template with variables resolved at render time.
 * Only variables within the template are resolved (no further interpretation).
 */
export interface TemplateEmbedParams extends BaseEmbedParams {
  embedType: EmbedType.TEMPLATE;
  
  /** The template content containing variables to resolve */
  template: string;
  
  /** Whether to ignore the first newline in the template (for better formatting) */
  ignoreFirstNewline?: boolean;
  
  // TODO: Runtime validation to ensure template has valid syntax
}

/**
 * Structure for variable references within embeds.
 * 
 * @remarks
 * Supports dot notation, bracket notation, and mixed notation for accessing fields.
 * Always disables path prefixing to maintain consistent behavior.
 */
export interface VariableReference {
  /** The base variable name */
  name: string;
  
  /** Optional field access chain (e.g., field1.field2[0].field3) */
  fields?: FieldAccess[];
  
  /** Flag to indicate this is a variable reference (not a path) */
  isVariableReference: true;
  
  // TODO: Runtime validation for valid variable name format
}

/**
 * Represents a single field access operation in a variable reference.
 */
export interface FieldAccess {
  /** The type of field access (dot or bracket) */
  type: 'dot' | 'bracket';
  
  /** The field name or index */
  field: string | number;
}

/**
 * Union type for all embed parameter types.
 * 
 * @remarks
 * This is the main type that should be used when working with embed directives.
 * TypeScript's type narrowing can be used with the embedType field to determine
 * the specific embed type at runtime.
 */
export type EmbedParams = PathEmbedParams | VariableEmbedParams | TemplateEmbedParams;

/**
 * Context configuration for embed resolution.
 * 
 * @remarks
 * Each embed type requires specific resolution context settings.
 */
export interface EmbedResolutionContext {
  /** The current file path for relative path resolution */
  currentFilePath: string;
  
  /** Whether this is a variable embed (disables path prefixing) */
  isVariableEmbed?: boolean;
  
  /** Explicitly disable path prefixing */
  disablePathPrefixing?: boolean;
  
  /** Prevent path prefixing for security */
  preventPathPrefixing?: boolean;
  
  /** Configure which variable types are allowed */
  allowedVariableTypes?: {
    text?: boolean;
    data?: boolean;
    path?: boolean;
  };
}

/**
 * Source location information for error reporting.
 */
export interface SourceLocation {
  /** Source file path */
  filePath?: string;
  
  /** Line number (1-based) */
  line?: number;
  
  /** Column number (1-based) */
  column?: number;
  
  /** Offset in characters from the start of the file */
  offset?: number;
}
```