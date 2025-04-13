import type { MeldNode, Location, VariableReferenceNode, InterpolatableValue, StructuredPath } from '@core/syntax/types/index.js';
import type { MeldVariable, VariableType } from '@core/types/variables.js';
import { ResolutionContext, ResolutionOptions, Field } from '@core/types/resolution.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { PathValidationContext, MeldPath } from '@core/types/paths.js';
import { Result } from '@core/types/result.js';
import { FieldAccessError } from '@core/errors/FieldAccessError.js';
import type { VariableResolutionTracker, ResolutionTrackingConfig } from '@tests/utils/debug/VariableResolutionTracker/index.js';
import { Field as AstField } from '@core/syntax/types/shared-types.js';
import type { JsonValue } from '@core/types/common.js';

export type { ResolutionContext, FormattingContext } from '@core/types/resolution.js';

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
   * @param context - The resolution context with state and configuration flags
   * @returns The string with all variables resolved
   * @throws {MeldResolutionError} If resolution fails and context.strict is true
   * 
   * @example
   * ```ts
   * const resolved = await resolutionService.resolveText(
   *   "Hello, {{name}}! Welcome to {{company}}.",
   *   createResolutionContext(state, { allowedVariableTypes: [VariableType.TEXT] })
   * );
   * ```
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
   * 
   * @param pathString - The path string with potential variables to resolve
   * @param context - The resolution context with state and path validation rules
   * @returns The resolved MeldPath object (which could be Normalized or Raw, File or Directory)
   * @throws {MeldResolutionError} If resolution fails and context.strict is true
   * @throws {PathValidationError} If the path violates security rules specified in context.pathContext
   * 
   * @example
   * ```ts
   * const configPath = await resolutionService.resolvePath(
   *   "$./src/config/$environment.json",
   *   createResolutionContext(state, { 
   *     allowedVariableTypes: [VariableType.TEXT, VariableType.PATH],
   *     pathContext: { purpose: PathPurpose.READ } 
   *   })
   * );
   * ```
   */
  resolvePath(pathString: string, context: ResolutionContext): Promise<MeldPath>;

  /**
   * Resolve command references ($command(args)) to their execution results.
   * 
   * @param commandName - The command name to resolve
   * @param args - The arguments passed to the command (already resolved)
   * @param context - The resolution context providing state and execution environment
   * @returns The command execution result as a string (standard behavior)
   * @throws {MeldResolutionError} If command resolution or execution fails and context.strict is true
   * 
   * @example
   * ```ts
   * const result = await resolutionService.resolveCommand(
   *   "listFiles",
   *   ["*.js", "--recursive"],
   *   createResolutionContext(state, { allowedVariableTypes: [VariableType.COMMAND] })
   * );
   * ```
   */
  resolveCommand(commandName: string, args: string[], context: ResolutionContext): Promise<string>;

  /**
   * Resolve content from a file path (represented by MeldPath).
   * Note: Direct file reading might be better suited for FileSystemService.
   * This method assumes the path is already resolved and validated appropriately.
   * 
   * @param path - The MeldPath object representing the file to read
   * @returns The file content as a string
   * @throws {MeldFileSystemError} If the file cannot be read
   */
  resolveFile(path: MeldPath): Promise<string>;

  /**
   * Resolve raw content nodes (TextNode, CodeFenceNode, etc.), preserving formatting but skipping comments.
   * Applies variable resolution within TextNodes based on the context.
   * 
   * @param nodes - The AST nodes to convert to text
   * @param context - The resolution context with state and flags
   * @returns The resolved content as a string
   * @throws {MeldResolutionError} If variable resolution within text fails and context.strict is true
   */
  resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>;

  /**
   * Resolves an array of AST nodes (only TextNode and VariableReferenceNode) into a single string.
   * Handles TextNodes and delegates VariableReferenceNodes to the appropriate resolver.
   */
  resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>;

  /**
   * Resolves any value based on the provided context rules.
   * This is a general-purpose resolution method that routes based on allowed types in context.
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
   * @param fieldPath An array of AST Field objects representing the access path.
   * @param context Context for resolution.
   * @returns A Promise resolving to a Result containing the resolved value or a FieldAccessError.
   */
  resolveFieldAccess(
    baseValue: unknown,
    fieldPath: AstField[],
    context: ResolutionContext
  ): Promise<Result<JsonValue, FieldAccessError>>;

  /**
   * Validate that a value can be resolved successfully within the given context.
   * Performs a dry run of resolution without returning the value.
   * 
   * @param value - The string or structured path to validate
   * @param context - The resolution context defining rules and state
   * @throws {MeldResolutionError | PathValidationError} If validation fails based on context rules
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
   * Note: Comprehensive circularity detection might involve CircularityService.
   * 
   * @param value - The string containing potential variable references
   * @param context - The resolution context (needed to resolve initial variable)
   * @throws {MeldResolutionError} If a circular reference is detected
   */
  detectCircularReferences(value: string, context: ResolutionContext): Promise<void>;
  
  /**
   * Convert a resolved value (typically JsonValue) to a formatted string based on context.
   * Uses FormattingContext potentially embedded within ResolutionContext.
   * 
   * @param value - The value to convert (e.g., from resolveData)
   * @param context - The resolution context containing formatting rules
   * @returns The formatted string representation
   * 
   * @example
   * ```ts
   * const dataValue = await resolutionService.resolveData("config", context);
   * const formatted = await resolutionService.convertToFormattedString(
   *   dataValue,
   *   context.withFormattingContext({ isBlock: true }) 
   * );
   * ```
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

export type { IResolutionService };
export type { VariableResolutionTracker, ResolutionTrackingConfig };
export type { MeldResolutionError, PathValidationError, FieldAccessError };

import type { StateServiceLike } from '@core/shared-service-types.js'; 