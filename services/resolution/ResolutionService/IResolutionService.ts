import type { MeldNode, StructuredPath } from 'meld-spec';
import { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Context for variable resolution, specifying what types of variables and operations are allowed
 */
export interface ResolutionContext {
  /** Current file being processed, for error reporting */
  currentFilePath?: string;
  
  /** What types of variables are allowed in this context */
  allowedVariableTypes: {
    text: boolean;    // {{var}} (formerly ${var})
    data: boolean;    // {{data}} (formerly #{data})
    path: boolean;    // $path
    command: boolean; // $command
  };
  
  /** Path validation rules when resolving paths */
  pathValidation?: {
    requireAbsolute: boolean;
    allowedRoots: string[]; // e.g. [$HOMEPATH, $PROJECTPATH]
  };

  /** Whether field access is allowed for data variables */
  allowDataFields?: boolean;

  /** The state service to use for variable resolution */
  state: IStateService;
}

/**
 * Error codes for resolution failures
 */
export enum ResolutionErrorCode {
  UNDEFINED_VARIABLE = 'UNDEFINED_VARIABLE',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  INVALID_VARIABLE_TYPE = 'INVALID_VARIABLE_TYPE',
  INVALID_PATH = 'INVALID_PATH',
  MAX_ITERATIONS_EXCEEDED = 'MAX_ITERATIONS_EXCEEDED',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  FIELD_ACCESS_ERROR = 'FIELD_ACCESS_ERROR',
  MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  INVALID_NODE_TYPE = 'INVALID_NODE_TYPE',
  INVALID_COMMAND = 'INVALID_COMMAND',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  INVALID_FIELD = 'INVALID_FIELD',
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND'
}

/**
 * Service responsible for resolving variables, commands, and paths in different contexts
 */
export interface IResolutionService {
  /**
   * Resolve text variables ({{var}}) in a string
   * Formerly used ${var} syntax, now unified with data variables to use {{var}}
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
  resolveFile(path: string): Promise<string>;

  /**
   * Resolve raw content nodes, preserving formatting but skipping comments
   */
  resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve any value based on the provided context rules
   */
  resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string>;

  /**
   * Validate that resolution is allowed in the given context
   */
  validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void>;

  /**
   * Extract a section from content by its heading
   * @param content The content to extract the section from
   * @param section The heading text to search for
   * @param fuzzy Optional fuzzy matching threshold (0-1, where 1 is exact match, defaults to 0.7)
   */
  extractSection(content: string, section: string, fuzzy?: number): Promise<string>;

  /**
   * Check for circular variable references
   */
  detectCircularReferences(value: string): Promise<void>;
} 