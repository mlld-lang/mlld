import { MeldNode } from 'meld-spec';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { InterpreterOptions } from '../IInterpreterService.js';

/**
 * Client interface for InterpreterService functionality needed by DirectiveService
 * This interface is used to break the circular dependency between InterpreterService and DirectiveService
 * 
 * @remarks
 * This client interface exposes only the methods that DirectiveService needs from InterpreterService.
 * It is implemented by a factory to avoid circular dependencies.
 */
export interface IInterpreterServiceClient {
  /**
   * Create a new interpreter context with a child state.
   * Useful for nested interpretation (import/embed).
   * 
   * @param parentState - The parent state to inherit from
   * @param filePath - Optional file path for the child context
   * @param options - Optional configuration options
   * @returns A child state initialized for interpretation
   */
  createChildContext(
    parentState: IStateService,
    filePath?: string,
    options?: InterpreterOptions
  ): Promise<IStateService>;

  /**
   * Interpret a sequence of Meld nodes.
   * Processes each node in order, updating state as necessary.
   * 
   * @param nodes - The nodes to interpret
   * @param options - Optional configuration options
   * @returns The final state after interpretation
   */
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptions
  ): Promise<IStateService>;
}