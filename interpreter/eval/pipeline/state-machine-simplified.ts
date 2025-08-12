/**
 * Simplified Pipeline State Machine
 * 
 * A cleaner implementation that removes support for nested retries,
 * which analysis showed are pathological and shouldn't exist.
 * 
 * Key simplifications:
 * - Single active retry context (no stack)
 * - Context reuse for same retry pattern
 * - No parent context tracking
 * - Clearer semantics
 */

/**
 * Simplified Retry Context - Just one at a time
 */
export interface SimplifiedRetryContext {
  id: string;                    // Unique context ID
  requestingStage: number;       // Stage that requested retry
  retryingStage: number;         // Stage being retried
  attemptNumber: number;         // Current attempt (1-based)
  allAttempts: string[];         // All outputs from retry attempts
}

/**
 * Pipeline Events - Same as before for compatibility
 */
export type PipelineEvent =
  | { type: 'PIPELINE_START'; input: string }
  | { type: 'STAGE_START'; stage: number; input: string; contextId?: string }
  | { type: 'STAGE_SUCCESS'; stage: number; output: string; contextId?: string }
  | { 
      type: 'STAGE_RETRY_REQUEST';
      requestingStage: number;
      targetStage: number;
      contextId: string;
    }
  | { type: 'STAGE_FAILURE'; stage: number; error: Error }
  | { type: 'PIPELINE_COMPLETE'; output: string }
  | { type: 'PIPELINE_ABORT'; reason: string };

/**
 * Simplified Pipeline State
 */
export interface SimplifiedPipelineState {
  status: 'IDLE' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED';
  currentStage: number;
  currentInput: string;
  baseInput: string;
  events: PipelineEvent[];
  
  // Simplified retry tracking
  activeRetryContext?: SimplifiedRetryContext;  // Just one active context
  globalStageRetryCount: Map<number, number>;   // Global safety limit
  
  // For @pipeline.retries.all accumulation
  allRetryHistory: Map<string, string[]>;       // contextId → all outputs
}

/**
 * Actions and Results - Same interfaces for compatibility
 */
export type PipelineAction =
  | { type: 'START'; input: string }
  | { type: 'STAGE_RESULT'; result: StageResult }
  | { type: 'ABORT'; reason: string };

export type StageResult =
  | { type: 'success'; output: string }
  | { type: 'retry'; reason?: string; from?: number }
  | { type: 'error'; error: Error };

export type NextStep =
  | { type: 'EXECUTE_STAGE'; stage: number; input: string; context: StageContext }
  | { type: 'COMPLETE'; output: string }
  | { type: 'ERROR'; stage: number; error: Error }
  | { type: 'ABORT'; reason: string }
  | { type: 'INVALID_ACTION' };

/**
 * Simplified Stage Context
 */
export interface StageContext {
  stage: number;                  // 1-indexed stage number
  attempt: number;                 // Global attempt count for this stage
  contextAttempt: number;          // Attempt within current retry context
  history: string[];               // Previous outputs from this stage
  previousOutputs: string[];       // Outputs from stages 0..stage-1
  globalAttempt: number;           // Total retries across all stages
  totalStages: number;
  outputs: Record<number, string>; // Array-style access
  contextId?: string;              // Current retry context ID
}

/**
 * Simplified Pipeline State Machine
 */
export class SimplifiedPipelineStateMachine {
  private state: SimplifiedPipelineState;
  private readonly maxRetriesPerContext = 10;
  private readonly maxGlobalRetriesPerStage = 20;
  private readonly totalStages: number;
  private readonly isStage0Retryable: boolean;

  constructor(totalStages: number, isStage0Retryable: boolean = false) {
    this.totalStages = totalStages;
    this.isStage0Retryable = isStage0Retryable;
    this.state = this.initialState();
  }

  private initialState(): SimplifiedPipelineState {
    return {
      status: 'IDLE',
      currentStage: 0,
      currentInput: '',
      baseInput: '',
      events: [],
      activeRetryContext: undefined,
      globalStageRetryCount: new Map(),
      allRetryHistory: new Map()
    };
  }

  /**
   * Public API - matches original interface
   */
  getTotalStages(): number {
    return this.totalStages;
  }

  getEvents(): ReadonlyArray<PipelineEvent> {
    return [...this.state.events];
  }

  getStatus(): SimplifiedPipelineState['status'] {
    return this.state.status;
  }

  /**
   * Get all retry history for simplified implementation
   */
  getAllRetryHistory(): Map<string, string[]> {
    return new Map(this.state.allRetryHistory);
  }

  /**
   * Main state transition function
   */
  transition(action: PipelineAction): NextStep {
    switch (action.type) {
      case 'START':
        return this.handleStart(action.input);
      case 'STAGE_RESULT':
        return this.handleStageResult(action.result);
      case 'ABORT':
        return this.handleAbort(action.reason);
      default:
        return { type: 'INVALID_ACTION' };
    }
  }

  private handleStart(input: string): NextStep {
    if (this.state.status !== 'IDLE') {
      return { type: 'INVALID_ACTION' };
    }

    // Initialize pipeline
    this.recordEvent({ type: 'PIPELINE_START', input });
    this.state.status = 'RUNNING';
    this.state.currentStage = 0;
    this.state.currentInput = input;
    this.state.baseInput = input;

    // Start first stage
    this.recordEvent({ type: 'STAGE_START', stage: 0, input });
    
    return {
      type: 'EXECUTE_STAGE',
      stage: 0,
      input: input,
      context: this.buildStageContext(0)
    };
  }

  private handleStageResult(result: StageResult): NextStep {
    const stage = this.state.currentStage;

    switch (result.type) {
      case 'success':
        return this.handleStageSuccess(stage, result.output);
      case 'retry':
        return this.handleStageRetry(stage, result.reason, result.from);
      case 'error':
        return this.handleStageError(stage, result.error);
    }
  }

  private handleStageSuccess(stage: number, output: string): NextStep {
    const context = this.state.activeRetryContext;
    
    // Record success
    this.recordEvent({ 
      type: 'STAGE_SUCCESS', 
      stage, 
      output,
      contextId: context?.id 
    });

    // Collect output if this is the retrying stage
    if (context && stage === context.retryingStage) {
      context.allAttempts.push(output);
    }
    
    // Early termination on empty output
    if (output === '') {
      this.state.status = 'COMPLETED';
      this.recordEvent({ type: 'PIPELINE_COMPLETE', output: '' });
      return { type: 'COMPLETE', output: '' };
    }
    
    // If we're in a retry context and just completed the retrying stage,
    // re-execute the requesting stage
    if (context && stage === context.retryingStage) {
      const nextStage = context.requestingStage;
      this.state.currentStage = nextStage;
      this.state.currentInput = output;
      
      this.recordEvent({ 
        type: 'STAGE_START', 
        stage: nextStage, 
        input: output,
        contextId: context.id
      });
      
      return {
        type: 'EXECUTE_STAGE',
        stage: nextStage,
        input: output,
        context: this.buildStageContext(nextStage)
      };
    }
    
    // Clear retry context when requesting stage completes successfully
    if (context && stage === context.requestingStage) {
      // Save attempts to history before clearing
      this.state.allRetryHistory.set(context.id, [...context.allAttempts]);
      this.state.activeRetryContext = undefined;
    }

    // Normal progression to next stage
    const nextStage = stage + 1;
    
    // Check if pipeline complete
    if (nextStage >= this.totalStages) {
      this.state.status = 'COMPLETED';
      this.recordEvent({ type: 'PIPELINE_COMPLETE', output });
      return { type: 'COMPLETE', output };
    }

    // Continue to next stage
    this.state.currentStage = nextStage;
    this.state.currentInput = output;

    this.recordEvent({ 
      type: 'STAGE_START', 
      stage: nextStage, 
      input: output,
      contextId: context?.id
    });

    return {
      type: 'EXECUTE_STAGE',
      stage: nextStage,
      input: output,
      context: this.buildStageContext(nextStage)
    };
  }

  private handleStageRetry(stage: number, reason?: string, fromOverride?: number): NextStep {
    const targetStage = fromOverride ?? Math.max(0, stage - 1);
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[SimplifiedStateMachine] handleStageRetry:', {
        requestingStage: stage,
        targetStage,
        hasActiveContext: !!this.state.activeRetryContext,
        contextRequestingStage: this.state.activeRetryContext?.requestingStage,
        contextRetryingStage: this.state.activeRetryContext?.retryingStage,
        willReuseContext: this.state.activeRetryContext?.requestingStage === stage && 
                         this.state.activeRetryContext?.retryingStage === targetStage
      });
    }
    
    // Special case: Stage 0 self-retry (synthetic source retrying itself)
    if (stage === 0 && targetStage === 0) {
      if (!this.isStage0Retryable) {
        return this.handleAbort('Stage 0 cannot retry: Input is not a function');
      }
      
      // Use simplified retry tracking for stage 0
      const globalRetries = this.state.globalStageRetryCount.get(0) || 0;
      if (globalRetries >= this.maxGlobalRetriesPerStage) {
        return this.handleAbort(`Stage 0 exceeded global retry limit (${this.maxGlobalRetriesPerStage})`);
      }
      
      // Increment global count
      this.state.globalStageRetryCount.set(0, globalRetries + 1);
      
      // Record retry event
      this.recordEvent({
        type: 'STAGE_RETRY_REQUEST',
        requestingStage: 0,
        targetStage: 0,
        contextId: 'stage0-self-retry'
      });
      
      // Re-execute stage 0
      this.recordEvent({
        type: 'STAGE_START',
        stage: 0,
        input: this.state.baseInput,
        contextId: 'stage0-self-retry'
      });
      
      return {
        type: 'EXECUTE_STAGE',
        stage: 0,
        input: this.state.baseInput,
        context: this.buildStageContext(0)
      };
    }
    
    // Check if stage 1 is trying to retry non-retryable stage 0
    if (targetStage === 0 && !this.isStage0Retryable) {
      return this.handleAbort('Cannot retry stage 0: Input is not a function');
    }
    
    // Check if we can reuse existing context (same retry pattern)
    let context = this.state.activeRetryContext;
    let isReusingContext = false;
    
    if (context && 
        context.requestingStage === stage && 
        context.retryingStage === targetStage) {
      // Reuse existing context - just increment attempt
      context.attemptNumber++;
      isReusingContext = true;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[SimplifiedStateMachine] Reusing context:', {
          contextId: context.id,
          attemptNumber: context.attemptNumber
        });
      }
    } else {
      // Create new context (replacing any existing one)
      const contextId = this.generateContextId();
      context = {
        id: contextId,
        requestingStage: stage,
        retryingStage: targetStage,
        attemptNumber: 1,
        allAttempts: []
      };
      
      // Save previous context's attempts if it exists
      if (this.state.activeRetryContext) {
        this.state.allRetryHistory.set(
          this.state.activeRetryContext.id,
          [...this.state.activeRetryContext.allAttempts]
        );
      }
      
      this.state.activeRetryContext = context;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[SimplifiedStateMachine] Created new context:', {
          contextId: context.id,
          requestingStage: stage,
          retryingStage: targetStage
        });
      }
    }
    
    // Check retry limits
    if (context.attemptNumber > this.maxRetriesPerContext) {
      return this.handleAbort(
        `Stage ${stage} exceeded retry limit (${this.maxRetriesPerContext} attempts)`
      );
    }
    
    // Check global limit for target stage
    const globalRetries = this.state.globalStageRetryCount.get(targetStage) || 0;
    if (globalRetries >= this.maxGlobalRetriesPerStage) {
      return this.handleAbort(
        `Stage ${targetStage} exceeded global retry limit (${this.maxGlobalRetriesPerStage})`
      );
    }
    
    // Increment global count for target stage
    this.state.globalStageRetryCount.set(targetStage, globalRetries + 1);
    
    // Record retry request
    this.recordEvent({
      type: 'STAGE_RETRY_REQUEST',
      requestingStage: stage,
      targetStage,
      contextId: context.id
    });
    
    // Get input for retry
    const retryInput = this.getInputForStage(targetStage);
    
    // Update state
    this.state.status = 'RETRYING';
    this.state.currentStage = targetStage;
    this.state.currentInput = retryInput;
    
    // Record stage start
    this.recordEvent({
      type: 'STAGE_START',
      stage: targetStage,
      input: retryInput,
      contextId: context.id
    });
    
    return {
      type: 'EXECUTE_STAGE',
      stage: targetStage,
      input: retryInput,
      context: this.buildStageContext(targetStage)
    };
  }

  private handleStageError(stage: number, error: Error): NextStep {
    this.recordEvent({ type: 'STAGE_FAILURE', stage, error });
    this.state.status = 'FAILED';
    
    return {
      type: 'ERROR',
      stage,
      error
    };
  }

  private handleAbort(reason: string): NextStep {
    this.recordEvent({ type: 'PIPELINE_ABORT', reason });
    this.state.status = 'FAILED';
    
    return {
      type: 'ABORT',
      reason
    };
  }

  /**
   * Build context for stage execution
   */
  private buildStageContext(stage: number): StageContext {
    const context = this.state.activeRetryContext;
    const events = this.state.events;
    
    // Build previous outputs
    const previousOutputs: string[] = [];
    for (let s = 0; s < stage; s++) {
      let found = false;
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event.type === 'STAGE_SUCCESS' && event.stage === s) {
          previousOutputs.push(event.output);
          found = true;
          break;
        }
      }
      if (!found) {
        previousOutputs.push('');
      }
    }
    
    // Get stage history (context-local)
    const stageHistory: string[] = [];
    if (context && (stage === context.requestingStage || stage === context.retryingStage)) {
      // Include attempts from current context
      stageHistory.push(...context.allAttempts);
    }
    
    // Count attempts - properly track for both requesting and retrying stages
    let contextAttempt = 1;
    if (context) {
      if (stage === context.retryingStage) {
        // For the retrying stage, use the context's attempt number
        contextAttempt = context.attemptNumber;
      } else if (stage === context.requestingStage) {
        // For the requesting stage, count how many times we've executed it
        // This is the number of successful retrying stage executions + 1
        contextAttempt = context.allAttempts.length + 1;
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[SimplifiedStateMachine] buildStageContext attempt:', {
          stage,
          requestingStage: context.requestingStage,
          retryingStage: context.retryingStage,
          attemptNumber: context.attemptNumber,
          allAttemptsLength: context.allAttempts.length,
          willUseAttempt: stage === context.requestingStage || stage === context.retryingStage,
          contextAttempt
        });
      }
    }
    
    // Global attempt count for this stage
    const globalStageRetries = this.state.globalStageRetryCount.get(stage) || 0;
    const attempt = globalStageRetries + 1;
    
    // Total retries across all stages
    let totalRetries = 0;
    for (const count of this.state.globalStageRetryCount.values()) {
      totalRetries += count;
    }
    const globalAttempt = totalRetries + 1;
    
    return {
      stage: stage + 1,  // 1-indexed for user
      attempt,
      contextAttempt,
      history: stageHistory,
      previousOutputs,
      globalAttempt,
      totalStages: this.totalStages,
      outputs: {
        0: this.state.baseInput,
        ...Object.fromEntries(previousOutputs.map((out, i) => [i + 1, out]))
      },
      contextId: context?.id
    };
  }

  /**
   * Helper methods
   */
  private generateContextId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getInputForStage(stage: number): string {
    if (stage === 0) {
      return this.state.baseInput;
    }
    
    // Find most recent success for stage-1
    for (let i = this.state.events.length - 1; i >= 0; i--) {
      const event = this.state.events[i];
      if (event.type === 'STAGE_SUCCESS' && event.stage === stage - 1) {
        return event.output;
      }
    }
    
    return this.state.baseInput;
  }

  private recordEvent(event: PipelineEvent): void {
    this.state.events.push(event);
  }
}