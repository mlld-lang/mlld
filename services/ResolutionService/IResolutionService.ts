import { MeldNode } from 'meld-spec';

/**
 * Context for variable resolution, specifying what types of variables and operations are allowed
 */
export interface ResolutionContext {
  /** Current file being processed, for error reporting */
  currentFilePath?: string;
  
  /** What types of variables are allowed in this context */
  allowedVariableTypes: {
    text: boolean;    // ${var}
    data: boolean;    // #{data}
    path: boolean;    // $path
    command: boolean; // $command
  };
  
  /** Path validation rules when resolving paths */
  pathValidation?: {
    requireAbsolute: boolean;
    allowedRoots: string[]; // e.g. [$HOMEPATH, $PROJECTPATH]
  };
}

/**
 * Error codes for resolution failures
 */
export enum ResolutionErrorCode {
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE',
  INVALID_COMMAND = 'INVALID_COMMAND',
  INVALID_PATH = 'INVALID_PATH',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  FIELD_ACCESS_ERROR = 'FIELD_ACCESS_ERROR'
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export interface IResolutionService {
  /**
   * Resolve text variables (${var}) in a string
   */
  resolveText(text: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve data variables and fields (#{data.field}) to their values
   */
  resolveData(ref: string, context: ResolutionContext): Promise<any>;

  /**
   * Resolve path variables ($path) to absolute paths.
   * This includes $HOMEPATH/$~ and $PROJECTPATH/$. resolution.
   */
  resolvePath(path: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve command references ($command(args)) to their results
   */
  resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve content from a file path
   */
  resolveContent(path: string): Promise<string>;

  /**
   * Resolve any value based on the provided context rules
   */
  resolveInContext(value: string, context: ResolutionContext): Promise<string>;

  /**
   * Validate that resolution is allowed in the given context
   */
  validateResolution(value: string, context: ResolutionContext): Promise<void>;

  /**
   * Extract a section from content by its heading
   */
  extractSection(content: string, section: string): Promise<string>;

  /**
   * Check for circular variable references
   */
  detectCircularReferences(value: string): Promise<void>;
} 