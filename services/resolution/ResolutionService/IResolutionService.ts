import type { MeldNode } from '@core/syntax/types/index.js';
import type { StateServiceLike, StructuredPath } from '@core/shared-service-types.js';
import { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index.js';

/**
 * Context for variable resolution, specifying what types of variables and operations are allowed.
 * Controls the behavior of resolution operations for security and validation.
 */
interface ResolutionContext {
  /** Current file being processed, for error reporting */
  currentFilePath?: string;
  
  /** What types of variables are allowed in this context */
  allowedVariableTypes: {
    /** Allow text variables {{var}} (formerly ${var}) */
    text: boolean;    
    /** Allow data variables {{data}} (formerly #{data}) */
    data: boolean;    
    /** Allow path variables $path */
    path: boolean;    
    /** Allow command interpolation $command */
    command: boolean; 
  };
  
  /** Path validation rules when resolving paths */
  pathValidation?: {
    /** Whether paths must be absolute */
    requireAbsolute: boolean;
    /** List of allowed path roots e.g. [$HOMEPATH, $PROJECTPATH] */
    allowedRoots: string[]; 
  };

  /** Whether field access is allowed for data variables (e.g., data.field) */
  allowDataFields?: boolean;

  /** Whether to throw errors on resolution failures (true) or attempt to recover (false) */
  strict?: boolean;

  /** Whether nested variable references are allowed */
  allowNested?: boolean;

  /** The state service to use for variable resolution */
  state: StateServiceLike;
}

/**
 * Error codes for resolution failures to enable precise error handling
 */
enum ResolutionErrorCode {
  /** Variable is undefined in the current context */
  UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE',
  /** Circular reference detected in variable resolution */
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  /** Resolution context is invalid or missing required properties */
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  /** Variable type is not allowed in the current context */
  INVALID_VARIABLE_TYPE = 'INVALID_VARIABLE_TYPE',
  /** Path format is invalid or violates path security rules */
  INVALID_PATH = 'INVALID_PATH',
  /** Maximum iteration count exceeded during resolution */
  MAX_ITERATIONS_EXCEEDED = 'MAX_ITERATIONS_EXCEEDED',
  /** Variable reference has invalid syntax */
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  /** Error accessing fields in a data variable */
  FIELD_ACCESS_ERROR = 'FIELD_ACCESS_ERROR',
  /** Maximum recursion depth exceeded during resolution */
  MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
  /** General resolution failure */
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  /** Node type is invalid for the requested operation */
  INVALID_NODE_TYPE = 'INVALID_NODE_TYPE',
  /** Command reference is invalid */
  INVALID_COMMAND = 'INVALID_COMMAND',
  /** Variable not found in the current state */
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  /** Field does not exist in the data variable */
  INVALID_FIELD = 'INVALID_FIELD',
  /** Command not found in the current state */
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  /** Section not found in the content */
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND',
  /** Specific field not found in variable */
  FIELD_NOT_FOUND = 'FIELD_NOT_FOUND',
  /** Invalid access pattern (e.g., array access on non-array) */
  INVALID_ACCESS = 'INVALID_ACCESS'
}

/**
 * Service responsible for resolving variables, commands, and paths in Meld content.
 * Handles all interpolation and reference resolution while enforcing security constraints.
 * 
 * @remarks
 * The ResolutionService is a core service that handles all variable interpolation and
 * reference resolution in Meld. It's responsible for replacing variables like {{var}},
 * resolving paths with special variables ($HOMEPATH, $PROJECTPATH), executing commands
 * via $command references, and extracting sections from content.
 * 
 * This service implements safety checks to prevent security issues like circular references
 * and unauthorized path access, while providing rich error information for debugging.
 * 
 * Dependencies:
 * - IStateService: For retrieving variable values
 * - IPathService: For path validation and resolution
 * - IFileSystemService: For file access
 * - ICircularityService: For detecting circular references
 */
interface IResolutionService {
  /**
   * Resolve text variables ({{var}}) in a string.
   * 
   * @param text - The string containing text variables to resolve
   * @param context - The resolution context with state and allowed variable types
   * @returns The string with all variables resolved
   * @throws {MeldResolutionError} If resolution fails and strict mode is enabled
   * 
   * @example
   * ```ts
   * const resolved = await resolutionService.resolveText(
   *   "Hello, {{name}}! Welcome to {{company}}.",
   *   { allowedVariableTypes: { text: true, data: false, path: false, command: false }, state }
   * );
   * ```
   */
  resolveText(text: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve data variables and fields ({{data.field}}) to their values.
   * 
   * @param ref - The data variable reference to resolve
   * @param context - The resolution context with state and allowed variable types
   * @returns The resolved data value
   * @throws {MeldResolutionError} If resolution fails and strict mode is enabled
   * 
   * @example
   * ```ts
   * const data = await resolutionService.resolveData(
   *   "user.profile.name",
   *   { allowedVariableTypes: { text: false, data: true, path: false, command: false }, 
   *     allowDataFields: true, state }
   * );
   * ```
   */
  resolveData(ref: string, context: ResolutionContext): Promise<any>;

  /**
   * Resolve path variables ($path) to absolute paths.
   * Handles $HOMEPATH/$~ and $PROJECTPATH/$. resolution.
   * 
   * @param path - The path with variables to resolve
   * @param context - The resolution context with state and allowed variable types
   * @returns The resolved absolute path
   * @throws {MeldResolutionError} If resolution fails and strict mode is enabled
   * @throws {PathValidationError} If the path violates path security rules
   * 
   * @example
   * ```ts
   * const absPath = await resolutionService.resolvePath(
   *   "$./src/config/$environment.json",
   *   { allowedVariableTypes: { text: true, data: false, path: true, command: false }, state }
   * );
   * ```
   */
  resolvePath(path: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolve command references ($command(args)) to their results.
   * 
   * @param cmd - The command name to resolve
   * @param args - The arguments to pass to the command
   * @param context - The resolution context with state and allowed variable types
   * @returns The command execution result
   * @throws {MeldResolutionError} If resolution fails and strict mode is enabled
   * 
   * @example
   * ```ts
   * const result = await resolutionService.resolveCommand(
   *   "listFiles",
   *   ["*.js", "--recursive"],
   *   { allowedVariableTypes: { text: true, data: true, path: true, command: true }, state }
   * );
   * ```
   */
  resolveCommand(cmd: string, args: string[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve content from a file path.
   * 
   * @param path - The path to the file to read
   * @returns The file content as a string
   * @throws {MeldFileSystemError} If the file cannot be read
   */
  resolveFile(path: string): Promise<string>;

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments.
   * 
   * @param nodes - The AST nodes to convert to text
   * @param context - The resolution context with state and allowed variable types
   * @returns The resolved content as a string
   * @throws {MeldResolutionError} If resolution fails and strict mode is enabled
   */
  resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve any value based on the provided context rules.
   * This is a general-purpose resolution method that handles different types of values.
   * 
   * @param value - The string or structured path to resolve
   * @param context - The resolution context with state and allowed variable types
   * @returns The resolved value as a string
   * @throws {MeldResolutionError} If resolution fails and strict mode is enabled
   */
  resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string>;

  /**
   * Resolves a field access on a variable (e.g., variable.field.subfield)
   * 
   * @param variableName - The base variable name
   * @param fieldPath - The path to the specific field
   * @param context - The resolution context with state and allowed variable types
   * @returns The resolved field value
   * @throws {MeldResolutionError} If field access fails
   */
  resolveFieldAccess(variableName: string, fieldPath: string, context: ResolutionContext): Promise<any>;

  /**
   * Validate that resolution is allowed in the given context.
   * Checks for allowed variable types and other context constraints without performing actual resolution.
   * 
   * @param value - The string or structured path to validate
   * @param context - The resolution context with state and allowed variable types
   * @throws {MeldResolutionError} If validation fails
   */
  validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void>;

  /**
   * Extract a section from content by its heading.
   * Useful for retrieving specific parts of markdown or other structured text.
   * 
   * @param content - The content to extract the section from
   * @param section - The heading text to search for
   * @param fuzzy - Optional fuzzy matching threshold (0-1, where 1 is exact match, defaults to 0.7)
   * @returns The extracted section content
   * @throws {MeldResolutionError} With code SECTION_NOT_FOUND if the section cannot be found
   * 
   * @example
   * ```ts
   * const apiDocs = await resolutionService.extractSection(
   *   readme,
   *   "API Documentation",
   *   0.8 // 80% match threshold
   * );
   * ```
   */
  extractSection(content: string, section: string, fuzzy?: number): Promise<string>;

  /**
   * Check for circular variable references.
   * 
   * @param value - The string to check for circular references
   * @throws {MeldResolutionError} With code CIRCULAR_REFERENCE if circular references are detected
   */
  detectCircularReferences(value: string): Promise<void>;
  
  /**
   * Enable tracking of variable resolution attempts.
   * This is primarily used for debugging and visualization.
   * 
   * @param config - Configuration for the resolution tracker
   */
  enableResolutionTracking(config: Partial<ResolutionTrackingConfig>): void;
  
  /**
   * Get the resolution tracker for debugging.
   * 
   * @returns The current resolution tracker or undefined if not enabled
   */
  getResolutionTracker(): VariableResolutionTracker | undefined;
}

export type { ResolutionContext, IResolutionService };
export { ResolutionErrorCode }; 