import type { MeldNode } from '@core/syntax/types';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { MeldError } from '@core/errors/MeldError.js';

/**
 * Error handler function type for handling Meld errors during interpretation.
 * 
 * @param error - The error to handle
 */
export interface ErrorHandler {
  (error: MeldError): void;
}

/**
 * Options for configuring the interpreter behavior.
 */
export interface InterpreterOptions {
  /**
   * Initial state to use for interpretation.
   * If not provided, a new state will be created.
   */
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
 * - IDirectiveService: For processing directive nodes
 * - IStateService: For maintaining state during interpretation
 */
export interface IInterpreterService {
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
   * @param stateService - Service for maintaining state
   */
  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void;

  /**
   * Interpret a sequence of Meld nodes.
   * Processes each node in order, updating state as necessary.
   * 
   * @param nodes - The nodes to interpret
   * @param options - Optional configuration options
   * @returns The final state after interpretation
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
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Interpret a single Meld node.
   * 
   * @param node - The node to interpret
   * @param state - The current state
   * @param options - Optional configuration options
   * @returns The state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpretNode(
    node: MeldNode,
    state: IStateService,
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Create a new interpreter context with a child state.
   * Useful for nested interpretation (import/embed).
   * 
   * @param parentState - The parent state to inherit from
   * @param filePath - Optional file path for the child context
   * @param options - Optional configuration options
   * @returns A child state initialized for interpretation
   * 
   * @example
   * ```ts
   * // Create a child context for processing an imported file
   * const childState = await interpreterService.createChildContext(
   *   parentState,
   *   'imported.meld',
   *   { importFilter: ['greeting', 'username'] }
   * );
   * ```
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string,
    options?: InterpreterOptions
  ): Promise<IStateService>;
} 