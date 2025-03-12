import { VariableResolutionTracker } from '@tests/utils/debug/VariableResolutionTracker/index.js';

/**
 * Client interface for VariableReferenceResolver functionality needed by ResolutionService
 * This interface is used to break the circular dependency between ResolutionService and VariableReferenceResolver
 */
export interface IVariableReferenceResolverClient {
  /**
   * Resolves all variable references in the given text
   * @param text - Text containing variable references like {{varName}}
   * @param context - Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  resolve(text: string, context: any): Promise<string>;

  /**
   * Set the resolution tracker for debugging
   * @param tracker - The resolution tracker to set
   */
  setResolutionTracker(tracker: VariableResolutionTracker): void;
} 