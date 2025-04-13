import type { MeldNode, SourceLocation } from '@core/syntax/types/index.js';
import type { DirectiveServiceLike } from '@core/shared-service-types.js';
import type { MeldError } from '@core/errors/MeldError.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Error handler function type for handling Meld errors during interpretation.
 * 
 * @param error - The error to handle
 */
interface ErrorHandler {
  (error: MeldError): void;
}

/**
 * Options for interpreting Meld documents
 */
export interface InterpreterOptions {
  /** Optional initial state to start interpretation from */
  initialState?: IStateService;

  /**
   * Current file path for error reporting and path resolution.
   */
  filePath?: string;

  /**
   * Whether to merge the final state back to the parent.
   * @default true
   */
  mergeState?: boolean;

  /**
   * List of variables to import.
   * If undefined, all variables are imported.
   * If empty array, no variables are imported.
   */
  importFilter?: string[];

  /**
   * Whether to run in strict mode.
   * In strict mode, all errors throw.
   * In permissive mode, recoverable errors become warnings.
   * @default true
   */
  strict?: boolean;

  /**
   * Custom error handler.
   * If provided, will be called for all errors.
   * In permissive mode, recoverable errors will be passed to this handler instead of throwing.
   */
  errorHandler?: ErrorHandler;
}

/**
 * Service responsible for interpreting Meld AST nodes and orchestrating the processing pipeline.
 * Acts as the core orchestration layer for the Meld execution lifecycle.
 * 
 * @remarks
 * The InterpreterService is the primary entry point for processing Meld content.
 * It coordinates the entire pipeline, from directive handling to state management.
 * It maintains contextual information during execution and manages error handling,
 * state transitions, and transformation tracking.
 * 
 * Dependencies:
 * - DirectiveServiceLike: For handling individual directives
 * - StateServiceLike: For maintaining state during interpretation
 */
interface IInterpreterService {
  /**
   * Check if this service can handle transformations.
   * 
   * @returns true if transformations are supported, false otherwise
   */
  canHandleTransformations(): boolean;

  /**
   * Initialize the InterpreterService with required dependencies.
   * 
   * @param directiveService - Service for handling directives
   * @param stateService - The state service to use
   */
  initialize(directiveService: DirectiveServiceLike, stateService: IStateService): void;

  /**
   * Interpret a sequence of Meld nodes.
   * Processes each node in order, updating state as necessary.
   * 
   * @param nodes - The nodes to interpret
   * @param options - Optional interpretation parameters
   * @returns A promise resolving to the final state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   * 
   * @example
   * ```ts
   * const content = '@text greeting = "Hello, world!"';
   * const nodes = await parserService.parse(content);
   * const state = await interpreterService.interpret(nodes, {
   *   filePath: 'example.meld',
   *   strict: true
   * });
   * ```
   */
  interpret(nodes: MeldNode[], options?: InterpreterOptions): Promise<IStateService>;

  /**
   * Interpret a single Meld node in the context of an existing state.
   *
   * @param node - The node to interpret
   * @param state - The current state context
   * @param options - Optional interpretation parameters
   * @returns A promise resolving to the updated state after interpreting the node
   */
  interpretNode(
    node: MeldNode,
    state: IStateService,
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Create a child interpretation context (state) from a parent state.
   * Used for handling nested processing like imports or embeds.
   *
   * @param parentState - The parent state service
   * @param filePath - Optional file path for the child context
   * @param options - Optional interpretation options for the child context
   * @returns A promise resolving to the newly created child state service
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string,
    options?: InterpreterOptions
  ): Promise<IStateService>;
} 

export type { ErrorHandler, InterpreterOptions, IInterpreterService }; 