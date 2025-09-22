import type { Environment } from '../../env/Environment';
import type { PipelineCommand, PipelineStage } from '@core/types';

// Import pipeline implementation
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { createStageEnvironment } from './context-builder';
import { MlldCommandExecutionError } from '@core/errors';
import { runBuiltinEffect, isBuiltinEffect } from './builtin-effects';
import { getStreamBus } from './stream-bus';
import { RateLimitRetry, isRateLimitError } from './rate-limit-retry';
import { logger } from '@core/utils/logger';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';

/**
 * Pipeline Executor - Handles actual execution using state machine
 */
/**
 * Pipeline Executor
 * WHY: Drive stage execution using the state machine and construct proper stage environments.
 * CONTEXT: Re-runs inline effects per retry; empty output is treated as early termination.
 */
export class PipelineExecutor {
  private stateMachine: PipelineStateMachine;
  private env: Environment;
  private format?: string;
  private pipeline: PipelineStage[];
  private isRetryable: boolean;
  private sourceFunction?: () => Promise<string>; // Store source function for retries
  private hasSyntheticSource: boolean;
  private sourceExecutedOnce: boolean = false; // Track if source has been executed once
  private initialInput: string = ''; // Store initial input for synthetic source
  private allRetryHistory: Map<string, string[]> = new Map();
  private rateLimiter = new RateLimitRetry();

  constructor(
    pipeline: PipelineStage[],
    env: Environment,
    format?: string,
    isRetryable: boolean = false,
    sourceFunction?: () => Promise<string>,
    hasSyntheticSource: boolean = false
  ) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Constructor:', {
        pipelineLength: pipeline.length,
        pipelineStages: pipeline.map(p => Array.isArray(p) ? '[parallel]' : p.rawIdentifier || 'unknown'),
        isRetryable,
        hasSourceFunction: !!sourceFunction,
        hasSyntheticSource
      });
    }
    
    // Use simplified state machine
    this.stateMachine = new PipelineStateMachine(pipeline.length, isRetryable);
    this.pipeline = pipeline;
    this.env = env;
    this.format = format;
    this.isRetryable = isRetryable;
    this.sourceFunction = sourceFunction;
    this.hasSyntheticSource = hasSyntheticSource;
  }

  /**
   * Execute the pipeline
   */
  /**
   * Execute the pipeline until completion or error.
   * WHY: Convert state-machine steps into actual command execution and effect emission.
   */
  async execute(initialInput: string): Promise<string> {
    // Store initial input for synthetic source stage
    this.initialInput = initialInput;
    // Publish pipeline start
    try { getStreamBus().publish({ type: 'PIPELINE_START', input: initialInput }); } catch {}
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Pipeline start:', {
        stages: this.pipeline.map(p => Array.isArray(p) ? '[parallel]' : p.rawIdentifier),
        hasSyntheticSource: this.hasSyntheticSource,
        isRetryable: this.isRetryable
      });
    }
    
    // Start the pipeline
    let nextStep = this.stateMachine.transition({ type: 'START', input: initialInput });
    let iteration = 0;

    // Process steps until complete
    while (nextStep.type === 'EXECUTE_STAGE') {
      iteration++;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[PipelineExecutor] Iteration ${iteration}:`, {
          stage: nextStep.stage,
          stageId: this.pipeline[nextStep.stage]?.rawIdentifier,
          contextAttempt: nextStep.context.contextAttempt
        });
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Execute stage:', {
          stage: nextStep.stage,
          contextId: nextStep.context.contextId,
          contextAttempt: nextStep.context.contextAttempt,
          inputLength: nextStep.input?.length,
          commandId: this.pipeline[nextStep.stage]?.rawIdentifier
        });
      }
      
      const stageEntry = this.pipeline[nextStep.stage];
      // Publish stage start
      try {
        getStreamBus().publish({
          type: 'STAGE_START',
          stage: nextStep.stage,
          attempt: nextStep.context.contextAttempt,
          commandId: Array.isArray(stageEntry) ? '[parallel]' : stageEntry?.rawIdentifier
        });
      } catch {}
      const result = Array.isArray(stageEntry)
        ? await this.executeParallelStage(stageEntry, nextStep.input, nextStep.context)
        : await this.executeStage(stageEntry, nextStep.input, nextStep.context);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage result:', {
          resultType: result.type,
          isRetry: result.type === 'retry'
        });
      }
      
      // Let state machine decide next step
      nextStep = this.stateMachine.transition({ 
        type: 'STAGE_RESULT', 
        result 
      });
      
      // Update retry history
      this.allRetryHistory = this.stateMachine.getAllRetryHistory();
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Next step:', {
          type: nextStep.type,
          nextStage: nextStep.type === 'EXECUTE_STAGE' ? nextStep.stage : undefined
        });
      }
      
      // Safety check for infinite loops
      if (iteration > 100) {
        throw new Error('Pipeline exceeded 100 iterations');
      }
    }
    
    // Handle final state
    switch (nextStep.type) {
      case 'COMPLETE':
        try { getStreamBus().publish({ type: 'PIPELINE_COMPLETE', output: nextStep.output }); } catch {}
        return nextStep.output;
      
      case 'ERROR':
        try { getStreamBus().publish({ type: 'STAGE_FAILURE', stage: nextStep.stage, error: nextStep.error }); } catch {}
        throw new MlldCommandExecutionError(
          `Pipeline failed at stage ${nextStep.stage + 1}: ${nextStep.error.message}`,
          undefined,
          {
            command: this.pipeline[nextStep.stage]?.rawIdentifier || 'unknown',
            exitCode: 1,
            duration: 0,
            workingDirectory: process.cwd()
          }
        );
      
      case 'ABORT':
        try { getStreamBus().publish({ type: 'PIPELINE_ABORT', reason: nextStep.reason }); } catch {}
        throw new MlldCommandExecutionError(
          `Pipeline aborted: ${nextStep.reason}`,
          undefined,
          {
            command: 'pipeline',
            exitCode: 1,
            duration: 0,
            workingDirectory: process.cwd()
          }
        );
      
      default:
        throw new Error('Pipeline ended in unexpected state');
    }
  }

  /**
   * Execute a single stage
   */
  /**
   * Execute a single pipeline stage with the constructed stage environment.
   * GOTCHA: Inline effects are run after successful stage execution and re-run on retries.
   */
  private async executeStage(
    command: PipelineCommand | PipelineCommand[],
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      // Effects, if any, are attached to functional stages and executed after success
      // Parallel group support: if the stage is an array of commands, execute all in parallel
      if (Array.isArray(command)) {
        const outputs: (string | { value: 'retry'; hint?: any; from?: number })[] = [];
        // Execute each sub-command with its own stage environment
        for (const sub of command) {
          const subEnv = await createStageEnvironment(
            sub,
            input,
            context,
            this.env,
            this.format,
            this.stateMachine.getEvents(),
            this.hasSyntheticSource,
            this.allRetryHistory
          );
          const out = await this.executeCommand(sub, input, subEnv);
          outputs.push(out);
        }
        // If any branch requested a retry, propagate a retry signal
        const retry = outputs.find(o => typeof o === 'object' && o && 'value' in o && (o as any).value === 'retry');
        if (retry) {
          const r = retry as any;
          return { type: 'retry', reason: r.hint || 'Parallel stage requested retry', from: r.from, hint: r.hint };
        }
        // Normalize outputs to strings and pass JSON array to next stage
        const normalized = outputs.map(o => String(o ?? ''));
        const jsonArray = JSON.stringify(normalized);
        return { type: 'success', output: jsonArray };
      }

      // Set up execution environment for a single command stage
      const stageEnv = await createStageEnvironment(
        command,
        input,
        context,
        this.env,
        this.format,
        this.stateMachine.getEvents(),
        this.hasSyntheticSource,
        this.allRetryHistory
      );
      
      let output: any;
      while (true) {
        try {
          output = await this.executeCommand(command, input, stageEnv);
          this.rateLimiter.reset();
          break;
        } catch (err: any) {
          if (isRateLimitError(err)) {
            if (process.env.MLLD_DEBUG === 'true') {
              logger.warn('Rate limit detected, retrying with backoff');
            }
            const retry = await this.rateLimiter.wait();
            if (retry) continue;
          }
          throw err;
        }
      }
      
      // No need to transfer nodes - effects are emitted immediately to the shared handler
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage output:', {
          stage: context.stage,
          output: typeof output === 'string' ? output.substring(0, 50) : output,
          isRetry: this.isRetrySignal(output)
        });
      }
      
      // Check for retry signal
      if (this.isRetrySignal(output)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Retry detected at stage', context.stage);
        }
        const from = this.parseRetryScope(output);
        // Publish retry request event immediately for progress sinks
        try {
          getStreamBus().publish({
            type: 'STAGE_RETRY_REQUEST',
            requestingStage: context.stage,
            targetStage: typeof from === 'number' ? from : Math.max(0, context.stage - 1),
            contextId: 'pending'
          });
        } catch {}
        const hint = this.parseRetryHint(output);
        return { type: 'retry', reason: hint || 'Stage requested retry', from, hint } as StageResult;
      }

      // Empty output terminates pipeline
      if (!output || output.trim() === '') {
        // Even with empty output, run any attached inline effects that might
        // be observing attempts (common for logging). Use empty output.
        await this.runInlineEffects(command, '', stageEnv);
        return { type: 'success', output: '' };
      }

      const normalized = this.normalizeOutput(output);
      // Clear hint for inline effects: @ctx.hint is only visible inside the retried stage body
      // May be worth revisiting this based on user feedback
      try {
        const pctx = this.env.getPipelineContext?.();
        if (pctx) {
          this.env.setPipelineContext({
            stage: pctx.stage,
            totalStages: pctx.totalStages,
            currentCommand: pctx.currentCommand,
            input: pctx.input,
            previousOutputs: pctx.previousOutputs,
            format: pctx.format,
            attemptCount: (pctx as any).attemptCount,
            attemptHistory: (pctx as any).attemptHistory,
            hint: null,
            hintHistory: (pctx as any).hintHistory || []
          } as any);
        }
      } catch {}
      // Run inline effects attached to this functional stage (non-stage effects)
      await this.runInlineEffects(command, normalized, stageEnv);
      // Publish stage success with basic metrics
      try {
        const bytes = Buffer.byteLength(normalized || '', 'utf8');
        const words = (normalized || '').trim() ? (normalized || '').trim().split(/\s+/).length : 0;
        getStreamBus().publish({
          type: 'STAGE_SUCCESS',
          stage: context.stage,
          outputPreview: (normalized || '').slice(0, 80),
          bytes,
          words,
          attempt: context.contextAttempt
        });
      } catch {}
      return { type: 'success', output: normalized };

    } catch (error) {
      try { getStreamBus().publish({ type: 'STAGE_FAILURE', stage: context.stage, error: error as Error }); } catch {}
      return { type: 'error', error: error as Error };
    } finally {
      this.env.clearPipelineContext();
    }
  }

  /**
   * Execute a pipeline command
   */
  /**
   * Execute a pipeline command (function or synthetic __source__).
   * CONTEXT: __source__ uses the initial input the first time, and a source function on retries.
   */
  private async executeCommand(
    command: PipelineCommand,
    input: string,
    stageEnv: Environment
  ): Promise<string | { value: 'retry'; hint?: any; from?: number }> {
    // Special handling for synthetic __source__ stage
    if (command.rawIdentifier === '__source__') {
      const firstTime = !this.sourceExecutedOnce;
      this.sourceExecutedOnce = true;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Executing __source__ stage:', {
          firstTime,
          hasSourceFunction: !!this.sourceFunction,
          isRetryable: this.isRetryable
        });
      }
      
      if (firstTime) {
        // First execution - return the already-computed initial input
        return this.initialInput;
      }
      
      // Retry execution - need to call source function
      if (!this.sourceFunction) {
        throw new Error('Cannot retry stage 0: input is not a function. Make the source a function to enable retries.');
      }
      
      // Re-execute the source function to get fresh input
      const fresh = await this.sourceFunction();
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Source function returned fresh input:', fresh);
      }
      return fresh;
    }

    // Synthetic identity stage for pipelines that only have inline effects
    if (command.rawIdentifier === '__identity__') {
      return input;
    }
    
    // Resolve the command reference
    const commandVar = await this.resolveCommandReference(command, stageEnv);
    
    if (!commandVar) {
      throw new Error(`Pipeline command ${command.rawIdentifier} not found`);
    }

    // Get arguments and validate them
    let args = await this.processArguments(command.args || [], stageEnv);

    // Smart parameter binding for pipeline functions
    if (args.length === 0) {
      args = await this.bindParametersAutomatically(commandVar, input);
    }

    // Execute with metadata preservation
    const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
    
    const result = await AutoUnwrapManager.executeWithPreservation(async () => {
      return await this.executeCommandVariable(commandVar, args, stageEnv, input);
    });

    return result;
  }

  /**
   * Process and validate command arguments
   */
  private async processArguments(args: any[], env: Environment): Promise<any[]> {
    const evaluatedArgs: any[] = [];

    for (const arg of args) {
      // Validate arguments - prevent explicit @input passing
      if (arg && typeof arg === 'object') {
        const isInputVariable = 
          (arg.type === 'variable' && arg.name === 'input') ||
          (arg.type === 'VariableReference' && arg.identifier === 'input');
        
        if (isInputVariable) {
          throw new Error(
            '@input is automatically available in pipelines - you don\'t need to pass it explicitly.'
          );
        }
      }

      // Evaluate the argument
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
        // Preserve primitives as-is for proper parameter typing downstream
        evaluatedArgs.push(arg);
      } else if (arg && typeof arg === 'object') {
        const evaluatedArg = await this.evaluateArgumentNode(arg, env);
        evaluatedArgs.push(evaluatedArg);
      }
    }

    return evaluatedArgs;
  }

  /**
   * Evaluate a single argument node
   */
  private async evaluateArgumentNode(arg: any, env: Environment): Promise<any> {
    if (arg.type === 'VariableReference') {
      const variable = env.getVariable(arg.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${arg.identifier}`);
      }

      const { resolveVariable, ResolutionContext } = await import('../../utils/variable-resolution');
      // Resolve variable in pipeline-input context to preserve wrapper types where appropriate
      let value = await resolveVariable(variable, env, ResolutionContext.PipelineInput);

      // Apply field access if present
      if (arg.fields && arg.fields.length > 0) {
        const { accessFields } = await import('../../utils/field-access');
        const fieldResult = await accessFields(value, arg.fields, { preserveContext: false, sourceLocation: (arg as any)?.location, env });
        value = fieldResult;
      }

      // Return raw value so executables receive correctly typed params (objects/arrays/strings)
      return value;
    }

    // For other node types, interpolate
    const { interpolate } = await import('../../core/interpreter');
    const value = await interpolate([arg], env);
    // Try to preserve JSON-like structures
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * Smart parameter binding for functions without explicit arguments
   */
  private async bindParametersAutomatically(commandVar: any, input: string): Promise<any[]> {
    let paramNames: string[] | undefined;
    
    if (commandVar && commandVar.type === 'executable' && commandVar.value) {
      paramNames = commandVar.value.paramNames;
    } else if (commandVar && commandVar.paramNames) {
      paramNames = commandVar.paramNames;
    }

    if (!paramNames || paramNames.length === 0) {
      return [];
    }

    // Auto-unwrap LoadContentResult objects
    const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
    const unwrappedOutput = AutoUnwrapManager.unwrap(input);

    // Single parameter - pass input directly
    if (paramNames.length === 1) {
      return [{ type: 'Text', content: unwrappedOutput }];
    }

    // Multiple parameters - try smart JSON destructuring
    try {
      const parsed = JSON.parse(unwrappedOutput);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return paramNames.map(name => ({
          type: 'Text',
          content: parsed[name] !== undefined 
            ? (typeof parsed[name] === 'string' ? parsed[name] : JSON.stringify(parsed[name]))
            : ''
        }));
      }
    } catch {
      // Not JSON, fall through
    }

    // Not an object or not JSON, pass as first parameter
    return [{ type: 'Text', content: unwrappedOutput }];
  }

  /**
   * Execute a command variable with arguments
   */
  private async executeCommandVariable(
    commandVar: any,
    args: any[],
    env: Environment,
    stdinInput?: string
  ): Promise<string | { value: 'retry'; hint?: any; from?: number }> {
    const { executeCommandVariable } = await import('./command-execution');
    return await executeCommandVariable(commandVar, args, env, stdinInput);
  }

  /**
   * Resolve a command reference to an executable variable
   */
  private async resolveCommandReference(
    command: PipelineCommand,
    env: Environment
  ): Promise<any> {
    const { resolveCommandReference } = await import('./command-execution');
    return await resolveCommandReference(command, env);
  }

  private isRetrySignal(output: any): boolean {
    const isRetry = output === 'retry' || 
      (output && typeof output === 'object' && output.value === 'retry');
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Retry check:', {
        output,
        result: isRetry
      });
    }
    
    return isRetry;
  }

  private parseRetryScope(output: any): number | undefined {
    if (output && typeof output === 'object' && typeof output.from === 'number') {
      return output.from;
    }
    return undefined;
  }

  private parseRetryHint(output: any): any {
    if (output && typeof output === 'object' && 'hint' in output) {
      return (output as any).hint;
    }
    return undefined;
  }

  private async executeParallelStage(
    commands: PipelineCommand[],
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      const results = await runWithConcurrency(
        commands,
        Math.min(getParallelLimit(), commands.length),
        async (cmd, i) => {
          const res = await this.executeStage(cmd, input, context);
          if (res.type !== 'success') {
            throw res.type === 'error' ? res.error : new Error('retry not supported in parallel stage');
          }
          return res.output;
        },
        { ordered: true }
      );
      return { type: 'success', output: JSON.stringify(results) };
    } catch (err) {
      return { type: 'error', error: err as Error };
    }
  }

  private normalizeOutput(output: any): string {
    if (typeof output === 'string') return output;
    if (output?.content && output?.filename) return output.content;
    return JSON.stringify(output);
  }

  /**
   * Execute any inline builtin effects attached to the command/stage.
   * Effects do not count as stages and run after successful execution.
   */
  private async runInlineEffects(
    command: any,
    stageOutput: string,
    stageEnv: Environment
  ): Promise<void> {
    if (!command?.effects || !Array.isArray(command.effects) || command.effects.length === 0) return;

    for (const effectCmd of command.effects) {
      try {
        if (!effectCmd?.rawIdentifier || !isBuiltinEffect(effectCmd.rawIdentifier)) continue;
        await runBuiltinEffect(effectCmd, stageOutput, stageEnv);
      } catch (err) {
        // Fail-fast on effect errors
        if (err instanceof Error) {
          throw new MlldCommandExecutionError(
            `Inline effect @${effectCmd.rawIdentifier} failed: ${err.message}`,
            undefined,
            {
              command: effectCmd.rawIdentifier,
              exitCode: 1,
              duration: 0,
              workingDirectory: process.cwd()
            }
          );
        }
        throw err;
      }
    }
  }
}
