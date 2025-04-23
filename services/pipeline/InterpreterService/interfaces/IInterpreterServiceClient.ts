import type { MeldNode } from '@core/syntax/types/index';
import type { InterpreterOptionsBase } from '@core/shared-service-types';
import type { InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { IStateService } from '@services/state/StateService/IStateService';

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
    options?: InterpreterOptionsBase
  ): Promise<IStateService>;

  /**
   * Interpret a sequence of Meld nodes.
   * Processes each node in order, updating state as necessary.
   * 
   * @param nodes - The nodes to interpret
   * @param options - Optional configuration options
   * @param initialState - Optional initial state for interpretation
   * @param circularityService - Optional circularity service for resolution
   * @returns The final state after interpretation
   */
  interpret(
    nodes: MeldNode[],
    options?: InterpreterOptionsBase,
    initialState?: IStateService,
    circularityService?: import('@services/resolution/CircularityService/ICircularityService.js').ICircularityService
  ): Promise<IStateService>;
}