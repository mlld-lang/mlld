import { DirectiveNode } from 'meld-spec';

/**
 * Client interface for DirectiveService functionality needed by ResolutionService
 * This interface is used to break the circular dependency between DirectiveService and ResolutionService
 */
export interface IDirectiveServiceClient {
  /**
   * Checks if the service supports a specific directive kind
   * @param kind - The directive kind to check
   * @returns True if the directive is supported, false otherwise
   */
  supportsDirective(kind: string): boolean;
  
  /**
   * Gets a list of all supported directive kinds
   * @returns Array of supported directive kinds
   */
  getSupportedDirectives(): string[];
} 