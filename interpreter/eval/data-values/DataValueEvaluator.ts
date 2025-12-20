import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { EvaluationStateManager } from './EvaluationStateManager';
import { PrimitiveEvaluator } from './PrimitiveEvaluator';
import { CollectionEvaluator } from './CollectionEvaluator';
import { VariableReferenceEvaluator } from './VariableReferenceEvaluator';
import { ForeachCommandEvaluator } from './ForeachCommandEvaluator';
import { ForeachSectionEvaluator } from './ForeachSectionEvaluator';
import { LoadContentEvaluator } from './LoadContentEvaluator';
import { logger } from '@core/utils/logger';

/**
 * Main coordinator for data value evaluation.
 * 
 * This class orchestrates the evaluation of data values by routing them to
 * appropriate specialized evaluators based on their type and structure.
 * It provides a clean separation between coordination logic and implementation
 * details while maintaining all the sophisticated evaluation semantics,
 * caching mechanisms, and performance optimizations.
 * 
 * Key Features:
 * - Type-based routing to specialized evaluators
 * - Dependency injection for better testability
 * - Centralized error handling and context
 * - Extensible design for new data value types
 */
export class DataValueEvaluator {
  private readonly stateManager: EvaluationStateManager;
  private readonly primitiveEvaluator: PrimitiveEvaluator;
  private readonly collectionEvaluator: CollectionEvaluator;
  private readonly variableReferenceEvaluator: VariableReferenceEvaluator;
  private readonly foreachCommandEvaluator: ForeachCommandEvaluator;
  private readonly foreachSectionEvaluator: ForeachSectionEvaluator;
  private readonly loadContentEvaluator: LoadContentEvaluator;

  constructor() {
    // Initialize state manager
    this.stateManager = new EvaluationStateManager();
    
    // Initialize evaluators with dependency injection
    this.primitiveEvaluator = new PrimitiveEvaluator(this.stateManager);
    this.collectionEvaluator = new CollectionEvaluator(this.evaluate.bind(this));
    this.variableReferenceEvaluator = new VariableReferenceEvaluator(this.evaluate.bind(this));
    this.foreachCommandEvaluator = new ForeachCommandEvaluator();
    this.foreachSectionEvaluator = new ForeachSectionEvaluator(this.evaluate.bind(this));
    this.loadContentEvaluator = new LoadContentEvaluator();
  }

  /**
   * Evaluates a DataValue, recursively evaluating any embedded directives,
   * variable references, or templates.
   * 
   * @param value The data value to evaluate
   * @param env The evaluation environment
   * @returns The evaluated result
   */
  async evaluate(
    value: DataValue,
    env: Environment,
    options?: { suppressErrors?: boolean }
  ): Promise<any> {
    
    try {
      // Route to appropriate evaluator based on type
      if (this.primitiveEvaluator.canHandle(value)) {
        return await this.primitiveEvaluator.evaluate(value, env);
      }
      
      if (this.collectionEvaluator.canHandle(value)) {
        const result = await this.collectionEvaluator.evaluate(value, env);
        return result;
      }
      
      if (this.variableReferenceEvaluator.canHandle(value)) {
        return await this.variableReferenceEvaluator.evaluate(value, env);
      }
      
      if (this.foreachCommandEvaluator.canHandle(value)) {
        return await this.foreachCommandEvaluator.evaluate(value, env);
      }
      
      if (this.foreachSectionEvaluator.canHandle(value)) {
        return await this.foreachSectionEvaluator.evaluate(value, env);
      }
      
      if (this.loadContentEvaluator.canHandle(value)) {
        return await this.loadContentEvaluator.evaluate(value, env);
      }
      
      // Fallback - return the value as-is
      logger.warn('Unexpected value type in DataValueEvaluator:', { value });
      return value;
      
    } catch (error) {
      // Build context string for better error messages
      const valueTypeField = typeof value === 'object' ? (value as any)?.type : undefined;
      const identifier = typeof value === 'object' ? (value as any)?.identifier : undefined;

      let contextHint = '';
      if (identifier) {
        contextHint = ` (evaluating @${identifier})`;
      } else if (valueTypeField) {
        contextHint = ` (evaluating ${valueTypeField})`;
      }

      // If the original error already has a good message, just re-throw it
      // Only wrap if the error message is missing or generic
      const originalMessage = error instanceof Error ? error.message : String(error);
      if (originalMessage && originalMessage.length > 0 && !originalMessage.includes('undefined')) {
        throw error;
      }

      // Wrap with context for generic/empty errors
      const wrappedError = new Error(
        `Data evaluation failed${contextHint}: ${originalMessage || 'unknown error'}`
      );
      if (error instanceof Error) {
        wrappedError.stack = error.stack;
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }

  /**
   * Gets the state manager for external access (if needed for testing)
   */
  getStateManager(): EvaluationStateManager {
    return this.stateManager;
  }

  /**
   * Gets evaluator statistics for monitoring and debugging
   */
  getEvaluatorStats(): Record<string, any> {
    const cacheStats = this.stateManager.getCacheStats();
    return {
      cacheSize: cacheStats.size,
      cacheEntries: cacheStats.entries,
      evaluatorTypes: [
        'PrimitiveEvaluator',
        'CollectionEvaluator', 
        'VariableReferenceEvaluator',
        'ForeachCommandEvaluator',
        'ForeachSectionEvaluator'
      ]
    };
  }
}
