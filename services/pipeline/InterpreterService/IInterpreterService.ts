import type { MeldNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';

export interface InterpreterOptions {
  /**
   * Initial state to use for interpretation
   * If not provided, a new state will be created
   */
  initialState?: IStateService;

  /**
   * Current file path for error reporting
   */
  filePath?: string;

  /**
   * Whether to merge the final state back to the parent
   * @default true
   */
  mergeState?: boolean;

  /**
   * List of variables to import
   * If undefined, all variables are imported
   * If empty array, no variables are imported
   */
  importFilter?: string[];
}

export interface IInterpreterService {
  /**
   * Check if this service can handle transformations
   * @returns true if transformations are supported
   */
  canHandleTransformations(): boolean;

  /**
   * Initialize the InterpreterService with required dependencies
   */
  initialize(
    directiveService: IDirectiveService,
    stateService: IStateService
  ): void;

  /**
   * Interpret a sequence of Meld nodes
   * @returns The final state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Interpret a single Meld node
   * @returns The state after interpretation
   * @throws {MeldInterpreterError} If interpretation fails
   */
  interpretNode(
    node: MeldNode,
    state: IStateService
  ): Promise<IStateService>;

  /**
   * Create a new interpreter context with a child state
   * Useful for nested interpretation (import/embed)
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string
  ): Promise<IStateService>;
} 