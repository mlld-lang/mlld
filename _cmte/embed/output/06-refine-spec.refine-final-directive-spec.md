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
  
  /** 
   * Stores the resolved content after processing
   * Added based on feedback from ContentResolution, StateCore, and CoreDirective services
   */
  resolvedContent?: string;
  
  /**
   * Tracks whether this embed has been successfully resolved
   * Added based on feedback from ContentResolution service
   */
  resolved?: boolean;
  
  /**
   * Additional settings for transformation mode
   * Added based on feedback from CoreDirective service
   */
  transformationSettings?: {
    applyTransformation?: boolean;
    preserveDirective?: boolean;
  };
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
  
  /**
   * MIME type of the embedded content
   * Added based on feedback from FileSystemCore service
   */
  mimeType?: string;
  
  /**
   * Original path string before resolution
   * Added based on feedback from ResolutionCore service
   */
  originalPath?: string;
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
  
  /**
   * Original variable reference syntax
   * Added based on feedback from ResolutionCore service
   */
  originalSyntax?: string;
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
  
  /** 
   * Whether to ignore the first newline in the template (for better formatting)
   * Defaults to true when template starts with [[ and contains a newline after
   */
  ignoreFirstNewline: boolean;
  
  /**
   * Original template string including delimiters
   * Added based on feedback from ParserCore and VariableResolution services
   */
  originalTemplate?: string;
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
  
  /**
   * Type of variable (text, data, path)
   * Added based on feedback from ParserCore service
   */
  variableType?: 'text' | 'data' | 'path';
  
  /**
   * Original syntax used in the source
   * Added based on feedback from ResolutionCore service
   */
  originalSyntax?: string;
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
  
  /** 
   * Configure which variable types are allowed
   * Defaults to allowing all types with explicit opt-out
   * Modified based on feedback from VariableResolution service
   */
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

/**
 * Result of an embed operation.
 * 
 * @remarks
 * Added based on feedback from multiple services including ContentResolution,
 * StateCore, and InterpreterCore to standardize the output of embed operations.
 */
export interface EmbedResult {
  /** The embedded content after processing */
  content: string;
  
  /** The type of embed that was processed */
  embedType: EmbedType;
  
  /** Whether the embed was successfully resolved */
  success: boolean;
  
  /** Error message if the embed failed */
  error?: string;
  
  /** Source location for error reporting */
  sourceLocation?: SourceLocation;
  
  /** Metadata about the embed operation for debugging */
  metadata?: {
    /** Time taken to resolve the embed */
    resolutionTimeMs?: number;
    
    /** Source of the embedded content */
    contentSource?: string;
    
    /** Size of the embedded content in bytes */
    contentSizeBytes?: number;
    
    /** MIME type of the content (for path embeds) */
    mimeType?: string;
  };
}

/**
 * Utility function to determine embed type from raw directive data.
 * 
 * @remarks
 * Added based on feedback from EmbedHandler service to assist with subtype detection.
 */
export function determineEmbedType(directiveData: any): EmbedType {
  // Check for template content
  if (directiveData.isTemplateContent === true || 
      (directiveData.content && 
       typeof directiveData.content === 'string' && 
       directiveData.content.startsWith('[[') && 
       directiveData.content.endsWith(']]'))) {
    return EmbedType.TEMPLATE;
  } 
  // Check for variable reference
  else if (
     // Standard variable reference from grammar
     (typeof directiveData.path === 'object' && 
      'isVariableReference' in directiveData.path && 
      directiveData.path.isVariableReference === true) ||
     // Simple string pattern: @embed {{variable}}
     (typeof directiveData.path === 'string' && 
      directiveData.path.startsWith('{{') && 
      directiveData.path.endsWith('}}'))
  ) {
    return EmbedType.VARIABLE;
  } 
  // Default to path embed
  else {
    return EmbedType.PATH;
  }
}

/**
 * Factory for creating embed resolution contexts.
 * 
 * @remarks
 * Added based on feedback from EmbedHandler service to simplify context creation.
 */
export class EmbedResolutionContextFactory {
  /**
   * Creates a context for variable embeds that disables path prefixing.
   */
  static forVariableEmbed(currentFilePath: string, state: any): EmbedResolutionContext {
    return {
      currentFilePath,
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
  
  /**
   * Creates a context for path embeds that enables path prefixing.
   */
  static forPathEmbed(currentFilePath: string, state: any): EmbedResolutionContext {
    return {
      currentFilePath,
      isVariableEmbed: false,
      disablePathPrefixing: false,
      preventPathPrefixing: false,
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true
      }
    };
  }
  
  /**
   * Creates a context for template embeds that disables path prefixing for variables.
   */
  static forTemplateEmbed(currentFilePath: string, state: any): EmbedResolutionContext {
    return {
      currentFilePath,
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