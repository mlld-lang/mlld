import type { 
    MeldNode, 
    InterpolatableValue, 
    StructuredPath, 
    Field, 
    VariableReferenceNode 
} from '@core/syntax/types/nodes';
import type { MeldVariable, VariableType } from '@core/types/variables';
import type { ResolutionContext, FormattingContext } from '@core/types/resolution';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { MeldPath, PathValidationContext } from '@core/types/paths';
import type { Result } from '@core/types';
import type { MeldResolutionError, PathValidationError, FieldAccessError } from '@core/errors';
import type { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker';
import { Field as AstField } from '@core/syntax/types/shared-types';
import type { JsonValue } from '@core/types/common';
import type { Location } from '@core/types';

export type { ResolutionContext, FormattingContext };

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
export interface IResolutionService {
  /**
   * Resolve text variables ({{var}}) in a string.
   * Deprecated: Use resolveInContext or resolveNodes for better context handling.
   * @deprecated Prefer resolveInContext or resolveNodes.
   */
  resolveText(text: string, context: ResolutionContext): Promise<string>;

  /**
   * Resolves a data variable reference, including potential field access.
   * 
   * @param node - The VariableReferenceNode representing the variable and its field access path.
   * @param context - The resolution context.
   * @returns The resolved JSON value.
   * @throws {VariableResolutionError} If the variable is not found or resolution fails.
   * @throws {FieldAccessError} If field access fails.
   */
  resolveData(node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue>;

  /**
   * Resolve path variables ($path) and constructs to MeldPath objects.
   * Handles special paths like $HOMEPATH, $PROJECTPATH, etc.
   * This primarily resolves the path string and validates it.
   * 
   * @param pathInput - The path string with potential variables to resolve
   * @param context - The resolution context with state and path validation rules
   * @returns The resolved MeldPath object (which could be Normalized or Raw, File or Directory)
   * @throws {MeldResolutionError} If resolution fails and context.strict is true
   * @throws {PathValidationError} If the path violates security rules specified in context.pathContext
   */
  resolvePath(pathInput: string | StructuredPath, context: ResolutionContext): Promise<MeldPath>;

  /**
   * Resolve command references ($command(args)) to their execution results.
   * Note: Execution logic might better reside in the command definition or specific handlers.
   * 
   * @param commandName - The command name to resolve
   * @param args - The arguments passed to the command (already resolved)
   * @param context - The resolution context providing state and execution environment
   * @returns The command execution result as a string (standard behavior)
   * @throws {MeldResolutionError} If command resolution or execution fails and context.strict is true
   */
  resolveCommand(commandName: string, args: string[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve content from a file path (represented by MeldPath).
   * Deprecated: Use FileSystemService.readFile directly.
   * @deprecated Prefer FileSystemService.readFile.
   */
  resolveFile(path: MeldPath): Promise<string>;

  /**
   * Resolve raw content nodes (TextNode, CodeFenceNode, etc.), preserving formatting but skipping comments.
   * Deprecated: Resolution should happen during interpretation (InterpreterService) or via resolveNodes.
   * @deprecated Prefer resolveNodes or ensure interpretation handles this.
   */
  resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>;

  /**
   * Resolves an array of AST nodes (specifically TextNode and VariableReferenceNode) into a single string.
   * Handles literal text and delegates VariableReferenceNodes to the appropriate resolver.
   * 
   * @param nodes - The InterpolatableValue array (TextNode | VariableReferenceNode)[]
   * @param context - The resolution context.
   * @returns The fully resolved and concatenated string content.
   * @throws {MeldResolutionError} If variable resolution fails in strict mode.
   */
  resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>;

  /**
   * Resolves any value based on the provided context rules.
   * This is the preferred general-purpose resolution method.
   * 
   * @param value - The string, structured path representation, or pre-parsed node array to resolve
   * @param context - The resolution context defining allowed types and rules
   * @returns The resolved value as a string
   * @throws {MeldResolutionError} If resolution fails and context.strict is true
   */
  resolveInContext(value: string | StructuredPath | InterpolatableValue, context: ResolutionContext): Promise<string>;

  /**
   * Resolves a field access path against a given base value.
   *
   * @param baseValue The starting value (e.g., an object, array).
   * @param fieldPath An array of AST Field objects (`{ type: 'field' | 'index', value: string | number }`) representing the access path.
   * @param context Context for resolution.
   * @returns A Promise resolving to a Result containing the resolved value or a FieldAccessError.
   */
  resolveFieldAccess(
    baseValue: unknown,
    fieldPath: AstField[],
    context: ResolutionContext
  ): Promise<Result<JsonValue, FieldAccessError>>;

  /**
   * Validate that a path can be resolved successfully within the given context.
   * Performs a dry run of path resolution without returning the value.
   * Primarily intended for path validation use cases.
   * 
   * @param pathInput - The path string to validate
   * @param validationContext - Specific context for path validation rules
   * @returns The resolved MeldPath if valid.
   * @throws {PathValidationError} If validation fails based on context rules
   * @throws {MeldResolutionError} If variables in the path cannot be resolved.
   */
  validateResolution(pathInput: string, validationContext: PathValidationContext): Promise<MeldPath>;

  /**
   * Extract a section from content based on its heading text.
   * 
   * @param content - The content string to extract from
   * @param sectionHeading - The heading text to locate the section
   * @param fuzzyThreshold - Optional fuzzy matching threshold (0-1, default 0.7)
   * @returns The extracted section content as a string
   * @throws {MeldResolutionError} If the section cannot be found
   */
  extractSection(content: string, sectionHeading: string, fuzzyThreshold?: number): Promise<string>;

  /**
   * Detect potential circular variable references within a string.
   * Deprecated: Circularity detection is handled by CircularityService.
   * @deprecated Use CircularityService for comprehensive detection.
   */
  detectCircularReferences(value: string, context: ResolutionContext): Promise<void>;
  
  /**
   * Convert a resolved value (typically JsonValue) to a formatted string based on context.
   * Uses FormattingContext potentially embedded within ResolutionContext.
   * 
   * @param value - The value to convert (e.g., from resolveData)
   * @param context - The resolution context containing formatting rules
   * @returns The formatted string representation
   */
  convertToFormattedString(value: JsonValue, context: ResolutionContext): Promise<string>;
  
  /**
   * Enable tracking of variable resolution attempts for debugging.
   * 
   * @param config - Configuration for the resolution tracker
   */
  enableResolutionTracking(config: Partial<ResolutionTrackingConfig>): void;
  
  /**
   * Get the resolution tracker instance if enabled.
   * 
   * @returns The VariableResolutionTracker instance or undefined
   */
  getResolutionTracker(): VariableResolutionTracker | undefined;
}

export type { FieldAccessError };
export type { VariableResolutionTracker, ResolutionTrackingConfig };

import type { StateServiceLike } from '@core/shared-service-types'; 