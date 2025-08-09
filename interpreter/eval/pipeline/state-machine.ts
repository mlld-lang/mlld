/**
 * Pipeline Events - The immutable log of what happened
 */
export type PipelineEvent =
  | { type: 'PIPELINE_START'; input: string }
  | { type: 'STAGE_START'; stage: number; input: string }
  | { type: 'STAGE_SUCCESS'; stage: number; output: string }
  | { type: 'STAGE_RETRY'; stage: number; from: number; reason?: string }
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
  // NO derived state - compute from events
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
  attempt: number;            // How many times THIS stage has been attempted
  history: string[];          // Previous successful outputs from THIS stage
  previousOutputs: string[];  // Outputs from previous stages (0..stage-1)
  globalAttempt: number;      // Total retry count + 1
  totalStages: number;        // Total number of stages
  outputs: Record<number, string>; // Array-style access (0=base, 1..n=stage outputs)
}

/**
 * Event-sourced query functions - derive everything from events
 */
export class EventQuery {
  /**
   * Find the last retry event that affects the given stage
   * A retry from stage X invalidates all stages >= X
   */
  static lastRetryIndexAffectingStage(events: PipelineEvent[], stage: number): number {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === 'STAGE_RETRY' && e.from <= stage) {
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
   * Count how many times a specific stage has issued a retry
   */
  static countSelfRetries(events: PipelineEvent[], stage: number): number {
    let count = 0;
    for (const e of events) {
      if (e.type === 'STAGE_RETRY' && e.stage === stage) {
        count++;
      }
    }
    return count;
  }

  /**
   * Count total retries across all stages
   */
  static countTotalRetries(events: PipelineEvent[]): number {
    return events.filter(e => e.type === 'STAGE_RETRY').length;
  }
}

/**
 * Pipeline State Machine - Pure event-sourced logic
 */
export class PipelineStateMachine {
  private state: PipelineState;
  private readonly maxRetries = 10;
  private readonly totalStages: number;

  constructor(totalStages: number) {
    this.totalStages = totalStages;
    this.state = this.initialState();
  }

  private initialState(): PipelineState {
    return {
      status: 'IDLE',
      currentStage: 0,
      currentInput: '',
      baseInput: '',
      events: []
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
    // Record success
    this.recordEvent({ type: 'STAGE_SUCCESS', stage, output });
    
    // Early termination on empty output
    if (output === '') {
      this.state.status = 'COMPLETED';
      this.recordEvent({ type: 'PIPELINE_COMPLETE', output: '' });
      return { type: 'COMPLETE', output: '' };
    }

    // Check if pipeline complete
    if (stage === this.totalStages - 1) {
      this.state.status = 'COMPLETED';
      this.recordEvent({ type: 'PIPELINE_COMPLETE', output });
      return { type: 'COMPLETE', output };
    }

    // Move to next stage
    const nextStage = stage + 1;
    this.state.currentStage = nextStage;
    this.state.currentInput = output;

    // Record next stage start
    this.recordEvent({ type: 'STAGE_START', stage: nextStage, input: output });

    return {
      type: 'EXECUTE_STAGE',
      stage: nextStage,
      input: output,
      context: this.buildStageContext(nextStage)
    };
  }

  private handleStageRetry(stage: number, reason?: string, fromOverride?: number): NextStep {
    // Check retry limit (count only this stage's retries)
    const retries = EventQuery.countSelfRetries(this.state.events, stage);
    if (retries >= this.maxRetries) {
      return this.handleAbort(`Stage ${stage} exceeded retry limit`);
    }

    // Determine restart point (default to local retry)
    const from = fromOverride ?? stage;
    
    // Record retry event
    this.recordEvent({ type: 'STAGE_RETRY', stage, from, reason });
    this.state.status = 'RETRYING';

    // Calculate restart point
    const restartPoint = this.calculateRestartPoint(from);
    this.state.currentStage = restartPoint.stage;
    this.state.currentInput = restartPoint.input;

    // Record stage start for the restart
    this.recordEvent({ type: 'STAGE_START', stage: restartPoint.stage, input: restartPoint.input });

    return {
      type: 'EXECUTE_STAGE',
      stage: restartPoint.stage,
      input: restartPoint.input,
      context: this.buildStageContext(restartPoint.stage)
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
   * Calculate where to restart after a retry
   */
  private calculateRestartPoint(from: number): { stage: number; input: string } {
    if (from === 0) {
      return { stage: 0, input: this.state.baseInput };
    }

    // Find the last successful output of the previous stage
    // considering any retries that might have invalidated it
    const boundary = EventQuery.lastRetryIndexAffectingStage(this.state.events, from - 1);
    const prevOutput = EventQuery.lastOkAfter(this.state.events, from - 1, boundary);
    
    return {
      stage: from,
      input: prevOutput ?? this.state.baseInput
    };
  }

  /**
   * Build context for a stage execution - ALL DERIVED FROM EVENTS
   */
  private buildStageContext(stage: number): StageContext {
    const events = this.state.events;
    
    // Build previousOutputs: outputs from stages 0..stage-1
    // considering invalidation from retries
    const previousOutputs: string[] = [];
    for (let s = 0; s < stage; s++) {
      // Find the boundary that affects THIS specific stage s
      const boundary = EventQuery.lastRetryIndexAffectingStage(events, s);
      const output = EventQuery.lastOkAfter(events, s, boundary);
      // Only add outputs that actually exist (were successful)
      if (output !== undefined) {
        previousOutputs.push(output);
      } else {
        previousOutputs.push(''); // Default for missing outputs
      }
    }
    
    // Get this stage's history (all successful outputs)
    const stageHistory = EventQuery.okOutputsForStage(events, stage);
    
    // Count attempts for this specific stage
    const attempt = EventQuery.countSelfRetries(events, stage) + 1;
    
    // Count global attempts
    const globalAttempt = EventQuery.countTotalRetries(events) + 1;

    return {
      stage: stage + 1,  // 1-indexed for display
      attempt,
      history: stageHistory,
      previousOutputs,
      globalAttempt,
      totalStages: this.totalStages,
      outputs: {
        0: this.state.baseInput,
        ...Object.fromEntries(previousOutputs.map((out, i) => [i + 1, out]))
      }
    };
  }

  private recordEvent(event: PipelineEvent): void {
    this.state.events.push(event);
  }
}