/**
 * Universal State Machine for Pipeline Execution
 * 
 * This is the new simplified state machine that works with UniversalContext.
 * Key principles:
 * - State machine ONLY manages flow (stages, attempts, transitions)
 * - Environment handles ALL execution
 * - Context is the immutable contract between them
 * - No special cases for source stages
 */

import { UniversalContext, createPipelineContext } from '@core/universal-context';
import { USE_UNIVERSAL_CONTEXT, DEBUG_UNIVERSAL_CONTEXT } from '@core/feature-flags';
import { logger } from '@core/utils/logger';

/**
 * Events that drive the state machine
 */
export type StateEvent =
  | { type: 'STAGE_RESULT'; result: StageResult }
  | { type: 'ABORT'; reason: string };

/**
 * Result from executing a stage
 */
export type StageResult =
  | { type: 'success'; output: string }
  | { type: 'retry'; reason?: string }
  | { type: 'error'; error: Error };

/**
 * State transitions returned by the machine
 */
export type StateTransition =
  | { type: 'EXECUTE_STAGE'; stage: number; context: UniversalContext }
  | { type: 'COMPLETE'; output: string }
  | { type: 'ABORT'; reason: string };

/**
 * Universal State Machine
 * 
 * Much simpler than the current state machine:
 * - No retry contexts or stacks
 * - No special source handling
 * - Just tracks stage, attempts, and history
 */
export class UniversalStateMachine {
  private currentStage: number = 0;
  private stageAttempts: Map<number, number> = new Map();
  private history: UniversalContext['history'] = [];
  private readonly maxRetriesPerStage: number;
  private readonly totalStages: number;
  
  constructor(totalStages: number, maxRetries: number = 10) {
    this.totalStages = totalStages;
    this.maxRetriesPerStage = maxRetries;
  }
  
  /**
   * Start the pipeline execution
   */
  start(initialInput: string): StateTransition {
    this.currentStage = 0;
    this.stageAttempts.clear();
    this.history = [];
    
    const context = this.buildContext(0, initialInput);
    
    if (DEBUG_UNIVERSAL_CONTEXT) {
      logger.debug('[Universal State Machine] Starting pipeline', { 
        stage: 0, 
        totalStages: this.totalStages 
      });
    }
    
    return {
      type: 'EXECUTE_STAGE',
      stage: 0,
      context
    };
  }
  
  /**
   * Process an event and determine next transition
   */
  transition(event: StateEvent, lastInput: string): StateTransition {
    switch (event.type) {
      case 'STAGE_RESULT':
        return this.handleStageResult(event.result, lastInput);
      
      case 'ABORT':
        return { type: 'ABORT', reason: event.reason };
      
      default:
        throw new Error(`Unknown event type: ${(event as any).type}`);
    }
  }
  
  /**
   * Handle the result from a stage execution
   */
  private handleStageResult(result: StageResult, lastInput: string): StateTransition {
    const attemptNumber = this.getAttemptNumber(this.currentStage);
    
    // Record this attempt in history
    this.history.push({
      stage: this.currentStage,
      try: attemptNumber,
      input: lastInput,
      output: result.type === 'success' ? result.output : '',
      timestamp: Date.now()
    });
    
    if (DEBUG_UNIVERSAL_CONTEXT) {
      logger.debug('[Universal State Machine] Stage result', {
        stage: this.currentStage,
        attempt: attemptNumber,
        resultType: result.type
      });
    }
    
    // Handle different result types
    switch (result.type) {
      case 'success':
        return this.handleSuccess(result.output);
      
      case 'retry':
        return this.handleRetry(result.reason || 'Stage requested retry', lastInput);
      
      case 'error':
        return {
          type: 'ABORT',
          reason: `Stage ${this.currentStage} failed: ${result.error.message}`
        };
      
      default:
        throw new Error(`Unknown result type: ${(result as any).type}`);
    }
  }
  
  /**
   * Handle successful stage execution
   */
  private handleSuccess(output: string): StateTransition {
    // Move to next stage
    this.currentStage++;
    
    // Check if pipeline is complete
    if (this.currentStage >= this.totalStages) {
      if (DEBUG_UNIVERSAL_CONTEXT) {
        logger.debug('[Universal State Machine] Pipeline complete', { output });
      }
      return { type: 'COMPLETE', output };
    }
    
    // Continue to next stage
    const context = this.buildContext(this.currentStage, output);
    
    return {
      type: 'EXECUTE_STAGE',
      stage: this.currentStage,
      context
    };
  }
  
  /**
   * Handle retry request
   */
  private handleRetry(reason: string, lastInput: string): StateTransition {
    const attempts = this.getAttemptNumber(this.currentStage);
    
    // Check retry limit
    if (attempts >= this.maxRetriesPerStage) {
      return {
        type: 'ABORT',
        reason: `Stage ${this.currentStage} exceeded retry limit (${this.maxRetriesPerStage} attempts)`
      };
    }
    
    // Increment attempt counter
    this.stageAttempts.set(this.currentStage, attempts + 1);
    
    // Always retry from stage 0 (the source)
    // This is the key simplification - no complex retry logic
    const retryStage = 0;
    this.currentStage = retryStage;
    
    // Get the original input for stage 0
    const originalInput = this.history.length > 0 ? this.history[0].input : lastInput;
    
    const context = this.buildContext(retryStage, originalInput);
    
    if (DEBUG_UNIVERSAL_CONTEXT) {
      logger.debug('[Universal State Machine] Retrying from source', {
        reason,
        stage: retryStage,
        attempt: this.getAttemptNumber(retryStage)
      });
    }
    
    return {
      type: 'EXECUTE_STAGE',
      stage: retryStage,
      context
    };
  }
  
  /**
   * Build context for a stage
   */
  private buildContext(stage: number, input: string): UniversalContext {
    const attempt = this.getAttemptNumber(stage);
    
    return createPipelineContext(
      stage + 1, // User-visible stage (1-based)
      attempt,
      this.history,
      {
        totalStages: this.totalStages,
        currentInput: input,
        // Add any other metadata as needed
      }
    );
  }
  
  /**
   * Get the current attempt number for a stage
   */
  private getAttemptNumber(stage: number): number {
    return this.stageAttempts.get(stage) || 1;
  }
  
  /**
   * Get total attempts across all stages (for debugging)
   */
  getTotalAttempts(): number {
    let total = 0;
    for (const attempts of this.stageAttempts.values()) {
      total += attempts;
    }
    return total;
  }
}

/**
 * Export the appropriate state machine based on feature flag
 * This allows gradual migration
 */
export function createStateMachine(totalStages: number, maxRetries?: number): any {
  if (USE_UNIVERSAL_CONTEXT) {
    return new UniversalStateMachine(totalStages, maxRetries);
  } else {
    // Import and use the current state machine
    const { PipelineStateMachine } = require('./state-machine');
    return new PipelineStateMachine();
  }
}