import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { DirectiveContextBase } from '@core/shared/types.js';
import type { 
  StateServiceLike, 
  ValidationServiceLike,
  PathServiceLike,
  FileSystemLike,
  ParserServiceLike,
  CircularityServiceLike,
  ResolutionServiceLike,
  DirectiveServiceLike
} from '@core/shared-service-types.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';

/**
 * Context for directive execution
 * Extends the base context with state-specific fields
 */
export interface DirectiveContext extends DirectiveContextBase {
  /** Parent state for nested contexts */
  parentState?: StateServiceLike;
  /** Current state for this directive */
  state: StateServiceLike;
  /** Current file being processed */
  currentFilePath?: string;
  /** Working directory for command execution */
  workingDirectory?: string;
  /** Resolution context for variable resolution */
  resolutionContext?: any;
}

/**
 * Interface for directive handlers
 */
export interface IDirectiveHandler {
  /** The directive kind this handler processes */
  readonly kind: string;

  /**
   * Execute the directive
   * 
   * @param node - The directive node to execute
   * @param context - The execution context
   * @returns The updated state after directive execution, or a DirectiveResult containing both state and optional replacement node
   * @throws {MeldDirectiveError} If directive execution fails
   */
  execute(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<DirectiveResult | StateServiceLike>;
}

/**
 * Service responsible for handling Meld directives in the processing pipeline.
 * Orchestrates directive validation, execution, and transformation.
 * 
 * @remarks
 * The DirectiveService acts as the core orchestrator for directive processing.
 * It maintains a registry of directive handlers, validates directive syntax and
 * semantics, and routes directives to the appropriate handler for execution.
 * 
 * This service is central to the Meld pipeline and interacts with nearly all
 * other services to process directives effectively.
 * 
 * Dependencies:
 * - ValidationServiceLike: For directive syntax and semantic validation
 * - StateServiceLike: For maintaining state during directive execution
 * - PathServiceLike: For path resolution in file-related directives
 * - FileSystemLike: For file operations in import and other directives
 * - ParserServiceLike: For parsing content in imports and fragments
 * - InterpreterServiceClientFactory: For nested interpretation in imports
 * - CircularityServiceLike: For detecting circular imports and references
 * - ResolutionServiceLike: For variable resolution in directive content
 */
export interface IDirectiveService extends DirectiveServiceLike {
  /**
   * Initialize the DirectiveService with required dependencies
   * 
   * @param validationService - Service for validating directive syntax and semantics
   * @param stateService - Service for maintaining state during execution
   * @param pathService - Service for path resolution
   * @param fileSystemService - Service for file operations
   * @param parserService - Service for parsing content
   * @param interpreterServiceClientFactory - Factory for creating interpreter service clients
   * @param circularityService - Service for detecting circular references
   * @param resolutionService - Service for variable resolution
   */
  initialize(
    validationService: ValidationServiceLike,
    stateService: StateServiceLike,
    pathService: PathServiceLike,
    fileSystemService: FileSystemLike,
    parserService: ParserServiceLike,
    interpreterServiceClientFactory: any, // Use 'any' to allow both IInterpreterService and InterpreterServiceClientFactory
    circularityService: CircularityServiceLike,
    resolutionService: ResolutionServiceLike
  ): void;

  /**
   * Update the interpreter service reference
   * This is needed to handle circular dependencies in initialization
   * 
   * @param interpreterService - The interpreter service to use
   * @deprecated Use interpreterServiceClientFactory instead
   */
  updateInterpreterService(interpreterService: any): void;

  /**
   * Handle a directive node
   * 
   * @param node - The directive node to handle
   * @param context - The execution context
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive handling fails
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveContext
  ): Promise<StateServiceLike>;

  /**
   * Register a new directive handler
   * 
   * @param handler - The handler to register
   * @throws {MeldServiceError} If a handler for the directive kind already exists
   */
  registerHandler(handler: IDirectiveHandler): void;

  /**
   * Check if a handler exists for a directive kind
   * 
   * @param kind - The directive kind to check
   * @returns true if a handler exists, false otherwise
   */
  hasHandler(kind: string): boolean;

  /**
   * Validate a directive node
   * 
   * @param node - The directive node to validate
   * @throws {MeldDirectiveError} If validation fails
   */
  validateDirective(node: DirectiveNode): Promise<void>;

  /**
   * Create a child context for nested directives
   * 
   * @param parentContext - The parent execution context
   * @param filePath - The file path for the child context
   * @returns A new directive context with a child state
   */
  createChildContext(
    parentContext: DirectiveContext,
    filePath: string
  ): DirectiveContext;

  /**
   * Process a directive node, validating and executing it
   * Values in the directive will already be interpolated by meld-ast
   * 
   * @param node - The directive node to process
   * @param parentContext - Optional parent context for nested directives
   * @returns The updated state after directive execution
   * @throws {MeldDirectiveError} If directive processing fails
   * 
   * @example
   * ```ts
   * const node = {
   *   type: 'Directive',
   *   kind: 'text',
   *   name: 'greeting',
   *   value: 'Hello, world!',
   *   // ... other properties
   * };
   * const state = await directiveService.processDirective(node);
   * ```
   */
  processDirective(node: DirectiveNode, parentContext?: DirectiveContext): Promise<StateServiceLike>;

  /**
   * Process multiple directive nodes in sequence
   * 
   * @param nodes - The directive nodes to process
   * @param parentContext - Optional parent context for nested directives
   * @returns The final state after processing all directives
   * @throws {MeldDirectiveError} If any directive processing fails
   */
  processDirectives(nodes: DirectiveNode[], parentContext?: DirectiveContext): Promise<StateServiceLike>;

  /**
   * Check if a directive kind is supported
   * 
   * @param kind - The directive kind to check
   * @returns true if the directive kind is supported, false otherwise
   */
  supportsDirective(kind: string): boolean;

  /**
   * Get a list of all supported directive kinds
   * 
   * @returns An array of supported directive kinds
   */
  getSupportedDirectives(): string[];
} 