/**
 * Data Value Evaluation System
 * 
 * This module contains the refactored data value evaluation system that was 
 * extracted from the monolithic data-value-evaluator.ts file.
 * 
 * The system is organized into focused evaluators that handle specific types
 * of data values while preserving the sophisticated evaluation semantics,
 * caching mechanisms, and performance optimizations of the original implementation.
 */

export { EvaluationStateManager } from './EvaluationStateManager';
export { PrimitiveEvaluator } from './PrimitiveEvaluator';
export { CollectionEvaluator } from './CollectionEvaluator';
export { VariableReferenceEvaluator } from './VariableReferenceEvaluator';
export { ForeachCommandEvaluator } from './ForeachCommandEvaluator';
export { ForeachSectionEvaluator } from './ForeachSectionEvaluator';
export { DataValueEvaluator } from './DataValueEvaluator';

export type { EvaluationState, CacheResult } from './EvaluationStateManager';

/**
 * Re-exports for convenience when working with the data value evaluation system
 */
export * from './EvaluationStateManager';
export * from './PrimitiveEvaluator';
export * from './CollectionEvaluator';
export * from './VariableReferenceEvaluator';
export * from './ForeachCommandEvaluator';
export * from './ForeachSectionEvaluator';
export * from './DataValueEvaluator';