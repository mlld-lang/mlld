import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { StateServiceLike } from '@core/shared-service-types.js';
import type { DirectiveResult } from './DirectiveTypes.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Client interface for DirectiveService functionality needed by other services
 * This interface is used to break the circular dependency between DirectiveService and other services
 * 
 * @remarks
 * This client interface exposes only the methods that InterpreterService needs from DirectiveService.
 * It is implemented by a factory to avoid circular dependencies.
 */
export interface IDirectiveServiceClient {
  /**
   * Check if the directive service supports a specific directive kind
   * @param kind The directive kind to check
   * @returns Whether the directive kind is supported
   */
  supportsDirective(kind: string): boolean;
  
  /**
   * Get a list of all supported directive kinds
   * @returns An array of supported directive kinds
   */
  getSupportedDirectives(): string[];
  
  /**
   * Process a directive node
   * This is an additional method needed by the InterpreterService
   * @param node The directive node to process
   * @param context The context for processing the directive
   * @returns A promise resolving to the updated state or directive result
   */
  handleDirective(
    node: DirectiveNode,
    context: DirectiveProcessingContext
  ): Promise<IStateService | DirectiveResult>;

  /**
   * Validates a directive node.
   * Ensures the directive syntax and parameters are correct.
   * 
   * @param node - The DirectiveNode to validate.
   * @returns A promise that resolves if validation is successful, or rejects with a DirectiveError.
   */
  validateDirective(node: DirectiveNode): Promise<void>;
} 