/**
 * Retry Context - Tracks a single retry request and its cascade
 */
export interface RetryContext {
  id: string;                    // Unique ID for this retry context
  requestingStage: number;       // Stage that requested the retry
  retryingStage: number;         // Stage being retried
  attemptNumber: number;         // Which attempt within this context
  parentContextId?: string;      // If this retry happened within another retry
}

/**
 * Pipeline Events - The immutable log of what happened
 */
export type PipelineEvent =
  | { type: 'PIPELINE_START'; input: string }
  | { type: 'STAGE_START'; stage: number; input: string; contextId?: string }
  | { type: 'STAGE_SUCCESS'; stage: number; output: string; contextId?: string }
  | { 
      type: 'STAGE_RETRY_REQUEST';     // Stage X requests retry of stage X-1
      requestingStage: number;          // Who's asking for retry
      targetStage: number;              // Who to retry
      contextId: string;                // New retry context ID
      parentContextId?: string;         // Parent retry context if nested
    }
  | { type: 'STAGE_FAILURE'; stage: number; error: Error }
  | { type: 'PIPELINE_COMPLETE'; output: string }
  | { type: 'PIPELINE_ABORT'; reason: string };

/**
 * Pipeline State - Minimal mutable state + event log
 */
export interface PipelineState {
  status: 'IDLE' | 'RUNNING' | 'RETRYING' | 'COMPLETED' | 'FAILED';
  currentStage: number;
  currentInput: string;
  baseInput: string;
  events: PipelineEvent[];
  
  // Retry context management
  activeContexts: RetryContext[];        // Stack of active retry contexts
  contextRetryCount: Map<string, Map<number, number>>; // contextId -> stage -> count
  globalStageRetryCount: Map<number, number>; // stage -> total retry count (global cap)
}

/**
 * Actions that can be sent to the state machine
 */
export type PipelineAction =
  | { type: 'START'; input: string }
  | { type: 'STAGE_RESULT'; result: StageResult }
  | { type: 'ABORT'; reason: string };

/**
 * Stage execution results
 */
export type StageResult =
  | { type: 'success'; output: string }
  | { type: 'retry'; reason?: string; from?: number }  // from = restart point
  | { type: 'error'; error: Error };

/**
 * Next steps for the executor
 */
export type NextStep =
  | { type: 'EXECUTE_STAGE'; stage: number; input: string; context: StageContext }
  | { type: 'COMPLETE'; output: string }
  | { type: 'ERROR'; stage: number; error: Error }
  | { type: 'ABORT'; reason: string }
  | { type: 'INVALID_ACTION' };

/**
 * Context provided to stage execution
 */
export interface StageContext {
  stage: number;              // 1-indexed stage number
  attempt: number;            // How many times THIS stage has been attempted (globally)
  contextAttempt: number;     // Attempt count within current context chain
  history: string[];          // Previous successful outputs from THIS stage
  previousOutputs: string[];  // Outputs from previous stages (0..stage-1)
  globalAttempt: number;      // Total retry count + 1
  totalStages: number;        // Total number of stages
  outputs: Record<number, string>; // Array-style access (0=base, 1..n=stage outputs)
  activeContexts: Array<{     // Active retry contexts (for debugging)
    id: string;
    requesting: number;
    retrying: number;
  }>;
}

/**
 * Event-sourced query functions - derive everything from events
 */
export class EventQuery {
  /**
   * Find the last retry event that affects the given stage
   * A retry targeting stage X invalidates all stages >= X
   */
  static lastRetryIndexAffectingStage(events: PipelineEvent[], stage: number): number {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'STAGE_RETRY_REQUEST' && e.targetStage <= stage) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Get the last successful output for a stage after a given event index
   */
  static lastOkAfter(events: PipelineEvent[], stage: number, afterIdx: number): string | undefined {
    for (let i = events.length - 1; i > afterIdx; i--) {
      const e = events[i];
      if (e.type === 'STAGE_SUCCESS' && e.stage === stage) {
        return e.output;
      }
    }
    return undefined;
  }

  /**
   * Get all successful outputs for a specific stage
   */
  static okOutputsForStage(events: PipelineEvent[], stage: number): string[] {
    const outputs: string[] = [];
    for (const e of events) {
      if (e.type === 'STAGE_SUCCESS' && e.stage === stage) {
        outputs.push(e.output);
      }
    }
    return outputs;
  }

  /**
   * Count how many times a specific stage has requested a retry
   */
  static countSelfRetries(events: PipelineEvent[], stage: number): number {
    let count = 0;
    for (const e of events) {
      if (e.type === 'STAGE_RETRY_REQUEST' && e.requestingStage === stage) {
        count++;
      }
    }
    return count;
  }

  /**
   * Count how many times a specific stage has been started (attempt count)
   */
  static countStageStarts(events: PipelineEvent[], stage: number): number {
    let count = 0;
    for (const e of events) {
      if (e.type === 'STAGE_START' && e.stage === stage) {
        count++;
      }
    }
    return count;
  }

  /**
   * Count total retries across all stages
   */
  static countTotalRetries(events: PipelineEvent[]): number {
    return events.filter(e => e.type === 'STAGE_RETRY_REQUEST').length;
  }
}

/**
 * Pipeline State Machine - Pure event-sourced logic with recursive retry support
 */
export class PipelineStateMachine {
  private state: PipelineState;
  private readonly maxRetriesPerContext = 10;  // Max retries per stage within a context
  private readonly maxGlobalRetriesPerStage = 20; // Global cap per stage across all contexts
  private readonly totalStages: number;
  private readonly isStage0Retryable: boolean;

  constructor(totalStages: number, isStage0Retryable: boolean = false) {
    this.totalStages = totalStages;
    this.isStage0Retryable = isStage0Retryable;
    this.state = this.initialState();
  }

  private initialState(): PipelineState {
    return {
      status: 'IDLE',
      currentStage: 0,
      currentInput: '',
      baseInput: '',
      events: [],
      activeContexts: [],
      contextRetryCount: new Map(),
      globalStageRetryCount: new Map()
    };
  }

  /**
   * Get total stages (for executor)
   */
  getTotalStages(): number {
    return this.totalStages;
  }

  /**
   * Get a read-only snapshot of the event log
   */
  getEvents(): ReadonlyArray<PipelineEvent> {
    return [...this.state.events]; // Return copy to prevent mutation
  }

  /**
   * Get current status
   */
  getStatus(): PipelineState['status'] {
    return this.state.status;
  }

  /**
   * Process an action and return next steps
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

    // Record pipeline start
    this.recordEvent({ type: 'PIPELINE_START', input });
    
    // Update state
    this.state.status = 'RUNNING';
    this.state.currentStage = 0;
    this.state.currentInput = input;
    this.state.baseInput = input;

    // Record stage 0 start
    this.recordEvent({ type: 'STAGE_START', stage: 0, input });

    // Execute first stage
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
    const currentContext = this.getCurrentContext();
    
    // Record success event
    this.recordEvent({ 
      type: 'STAGE_SUCCESS', 
      stage, 
      output,
      contextId: currentContext?.id 
    });
    
    // Early termination on empty output
    if (output === '') {
      this.state.status = 'COMPLETED';
      this.recordEvent({ type: 'PIPELINE_COMPLETE', output: '' });
      return { type: 'COMPLETE', output: '' };
    }
    
    // Check if we just completed the retrying stage in a retry context
    if (currentContext && stage === currentContext.retryingStage) {
      // The retrying stage has completed - now re-execute the requesting stage
      const nextStage = currentContext.requestingStage;
      
      this.state.currentStage = nextStage;
      this.state.currentInput = output;
      
      this.recordEvent({ 
        type: 'STAGE_START', 
        stage: nextStage, 
        input: output,
        contextId: currentContext.id
      });
      
      return {
        type: 'EXECUTE_STAGE',
        stage: nextStage,
        input: output,
        context: this.buildStageContext(nextStage)
      };
    }
    
    // Check if this completes a retry context
    // The context should be popped when the REQUESTING stage completes successfully
    if (currentContext && stage === currentContext.requestingStage) {
      // The requesting stage has completed successfully without requesting another retry
      // Pop the context and continue normally
      this.state.activeContexts.pop();
    }

    // Normal progression to next stage
    const nextStage = stage + 1;
    
    // Check if pipeline complete
    if (nextStage >= this.totalStages) {
      this.state.status = 'COMPLETED';
      this.recordEvent({ type: 'PIPELINE_COMPLETE', output });
      return { type: 'COMPLETE', output };
    }

    this.state.currentStage = nextStage;
    this.state.currentInput = output;

    // Record next stage start
    this.recordEvent({ 
      type: 'STAGE_START', 
      stage: nextStage, 
      input: output,
      contextId: currentContext?.id
    });

    return {
      type: 'EXECUTE_STAGE',
      stage: nextStage,
      input: output,
      context: this.buildStageContext(nextStage)
    };
  }

  private handleStageRetry(stage: number, reason?: string, fromOverride?: number): NextStep {
    // CORRECT BEHAVIOR: Stage N requests retry of stage N-1 (the stage that provided its input)
    // No stage can retry itself - there is no self-referential retry mechanism
    const targetStage = fromOverride ?? Math.max(0, stage - 1);
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[StateMachine] handleStageRetry:', {
        requestingStage: stage,
        targetStage,
        fromOverride,
        isStage0Retryable: this.isStage0Retryable,
        activeContexts: this.state.activeContexts.length,
        willTakeSpecialCase: stage === 0 && targetStage === 0
      });
    }
    
    // Special case: Stage 0 trying to retry would mean retrying its source
    // When stage 0 requests retry, it means retrying itself (re-executing source function)
    if (stage === 0 && targetStage === 0) {
      if (!this.isStage0Retryable) {
        return this.handleAbort(
          `Stage 0 cannot retry: Input is not a function and cannot be retried`
        );
      }
      
      // Check retry limits for stage 0 self-retry
      const globalRetries = this.state.globalStageRetryCount.get(0) || 0;
      if (globalRetries >= this.maxGlobalRetriesPerStage) {
        return this.handleAbort(
          `Stage 0 exceeded global retry limit (${this.maxGlobalRetriesPerStage})`
        );
      }
      
      // For stage 0 self-retry, use a special "root" context and track retries there
      const rootContextId = 'root';
      const rootRetries = this.countRetriesForStageInContext(0, rootContextId);
      if (rootRetries >= this.maxRetriesPerContext) {
        return this.handleAbort(
          `Stage 0 exceeded retry limit (${this.maxRetriesPerContext})`
        );
      }
      
      // Increment retry counts
      this.incrementRetryCount(rootContextId, 0);
      this.state.globalStageRetryCount.set(0, globalRetries + 1);
      
      // Record retry event
      this.recordEvent({
        type: 'STAGE_RETRY_REQUEST',
        requestingStage: 0,
        targetStage: 0,
        contextId: rootContextId
      });
      
      // Re-execute stage 0
      this.recordEvent({
        type: 'STAGE_START',
        stage: 0,
        input: this.state.baseInput,
        contextId: rootContextId
      });
      
      return {
        type: 'EXECUTE_STAGE',
        stage: 0,
        input: this.state.baseInput,
        context: this.buildStageContext(0)
      };
    } else if (targetStage === 0 && stage === 1 && !this.isStage0Retryable) {
      // Stage 1 trying to retry stage 0 when it's not retryable
      return this.handleAbort(
        `Cannot retry stage 0: Input is not a function and cannot be retried`
      );
    }
    
    // Get current context if we're in one
    const currentContext = this.getCurrentContext();
    
    // Check if we already have an active context for this retry pattern
    // Since we don't need nested retries, we should only have one active context
    let existingContext: RetryContext | undefined;
    if (this.state.activeContexts.length > 0) {
      const lastContext = this.state.activeContexts[this.state.activeContexts.length - 1];
      if (lastContext.requestingStage === stage && lastContext.retryingStage === targetStage) {
        existingContext = lastContext;
      }
    }
    
    let retryContext: RetryContext;
    let contextId: string;
    
    if (existingContext) {
      // Reuse existing context and increment attempt
      existingContext.attemptNumber++;
      retryContext = existingContext;
      contextId = existingContext.id;
    } else {
      // Create new retry context
      contextId = this.generateContextId();
      retryContext = {
        id: contextId,
        requestingStage: stage,
        retryingStage: targetStage,
        attemptNumber: 1,
        parentContextId: currentContext?.id
      };
      
      // Push new context onto stack
      this.state.activeContexts.push(retryContext);
    }
    
    // Check global retry limit for target stage
    const globalRetries = this.state.globalStageRetryCount.get(targetStage) || 0;
    if (globalRetries >= this.maxGlobalRetriesPerStage) {
      return this.handleAbort(
        `Stage ${targetStage} exceeded global retry limit (${this.maxGlobalRetriesPerStage})`
      );
    }
    
    // Check per-context retry limit
    const currentContextId = retryContext.id;
    if (retryContext.attemptNumber > this.maxRetriesPerContext) {
      return this.handleAbort(
        `Stage ${stage} exceeded retry limit in context ${currentContextId}`
      );
    }
    
    // Record retry request event
    this.recordEvent({
      type: 'STAGE_RETRY_REQUEST',
      requestingStage: stage,
      targetStage,
      contextId: contextId,
      parentContextId: currentContext?.id
    });
    
    // Increment retry counts
    // Increment the requesting stage's count in the current context
    this.incrementRetryCount(currentContextId, stage);
    // Also track global retries for the target stage
    const newGlobalCount = globalRetries + 1;
    this.state.globalStageRetryCount.set(targetStage, newGlobalCount);
    
    // Calculate input for retry
    const retryInput = this.getInputForStage(targetStage);
    
    // Update state
    this.state.status = 'RETRYING';
    this.state.currentStage = targetStage;
    this.state.currentInput = retryInput;
    
    // Record stage start in retry context
    this.recordEvent({
      type: 'STAGE_START',
      stage: targetStage,
      input: retryInput,
      contextId: contextId
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
   * Generate unique context ID
   */
  private generateContextId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get current active context
   */
  private getCurrentContext(): RetryContext | undefined {
    return this.state.activeContexts[this.state.activeContexts.length - 1];
  }
  
  /**
   * Count retries for a stage within a specific context
   */
  private countRetriesForStageInContext(stage: number, contextId: string): number {
    const contextCounts = this.state.contextRetryCount.get(contextId);
    return contextCounts?.get(stage) || 0;
  }
  
  /**
   * Get/create context retry counts
   */
  private getOrCreateContextCounts(contextId: string): Map<number, number> {
    if (!this.state.contextRetryCount.has(contextId)) {
      this.state.contextRetryCount.set(contextId, new Map());
    }
    return this.state.contextRetryCount.get(contextId)!;
  }
  
  /**
   * Increment retry count for stage in context
   */
  private incrementRetryCount(contextId: string, stage: number): void {
    const counts = this.getOrCreateContextCounts(contextId);
    counts.set(stage, (counts.get(stage) || 0) + 1);
  }
  
  /**
   * Get input for a stage (considering retry contexts)
   */
  private getInputForStage(stage: number): string {
    if (stage === 0) {
      return this.state.baseInput;
    }
    
    // Find the most recent success for stage-1
    for (let i = this.state.events.length - 1; i >= 0; i--) {
      const event = this.state.events[i];
      if (event.type === 'STAGE_SUCCESS' && event.stage === stage - 1) {
        return event.output;
      }
    }
    
    return this.state.baseInput;
  }
  
  /**
   * Count retries in current context chain
   */
  private countRetriesInContextChain(stage: number): number {
    if (this.state.activeContexts.length === 0) {
      return 0;
    }
    
    // Find the context where this stage is being retried
    for (const context of this.state.activeContexts) {
      if (context.retryingStage === stage) {
        // Return the attempt number minus 1 (since attemptNumber is 1-based)
        return context.attemptNumber - 1;
      }
    }
    
    return 0;
  }
  
  /**
   * Count global retries for a stage across all contexts
   */
  private countGlobalRetriesForStage(stage: number): number {
    let count = 0;
    for (const event of this.state.events) {
      if (event.type === 'STAGE_RETRY_REQUEST' && event.targetStage === stage) {
        count++;
      }
    }
    return count;
  }

  /**
   * Build context for a stage execution - Enhanced with retry context info
   */
  private buildStageContext(stage: number): StageContext {
    const events = this.state.events;
    
    // Build previousOutputs: outputs from stages 0..stage-1
    const previousOutputs: string[] = [];
    for (let s = 0; s < stage; s++) {
      // Find the most recent success for this stage
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
        previousOutputs.push(''); // No output yet for this stage
      }
    }
    
    // Get this stage's history IN CURRENT CONTEXT ONLY
    // This ensures @pipeline.tries is context-local
    const currentContext = this.getCurrentContext();
    const contextId = currentContext?.id;
    const stageHistory: string[] = [];
    
    if (contextId) {
      // Only include outputs from current context
      for (const event of events) {
        if (event.type === 'STAGE_SUCCESS' && 
            event.stage === stage && 
            event.contextId === contextId) {
          stageHistory.push(event.output);
        }
      }
    }
    
    // Count global attempts for this stage (across all contexts)
    const globalStageRetries = this.countGlobalRetriesForStage(stage);
    const attempt = globalStageRetries + 1;
    
    // Count retries in current context chain
    const contextRetries = this.countRetriesInContextChain(stage);
    const contextAttempt = contextRetries + 1;
    
    // Count total retries across all stages
    let totalRetries = 0;
    for (const event of events) {
      if (event.type === 'STAGE_RETRY_REQUEST') {
        totalRetries++;
      }
    }
    const globalAttempt = totalRetries + 1;
    
    // Get active contexts for debugging
    const activeContexts = this.state.activeContexts.map(c => ({
      id: c.id,
      requesting: c.requestingStage,
      retrying: c.retryingStage
    }));

    return {
      stage: stage + 1,  // 1-indexed for display
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
      activeContexts
    };
  }

  private recordEvent(event: PipelineEvent): void {
    this.state.events.push(event);
  }
}