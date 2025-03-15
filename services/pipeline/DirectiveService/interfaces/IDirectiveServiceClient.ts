import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { StateServiceLike } from '@core/shared-service-types.js';

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
   * @returns A promise that resolves to the updated state
   */
  handleDirective?(node: DirectiveNode, context: any): Promise<StateServiceLike>;
} 