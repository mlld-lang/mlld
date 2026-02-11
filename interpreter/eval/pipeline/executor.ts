import type { Environment } from '../../env/Environment';
import type { PipelineCommand, PipelineStage, PipelineStageEntry } from '@core/types';
import type { ExecInvocation, CommandReference } from '@core/types/primitives';
import type { OperationContext } from '../../env/ContextManager';
import type { StructuredValue } from '../../utils/structured-value';
import type { SecurityDescriptor, DataLabel } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import { getOperationLabels } from '@core/policy/operation-labels';

// Import pipeline implementation
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { MlldCommandExecutionError } from '@core/errors';
import { runBuiltinEffect, isBuiltinEffect } from './builtin-effects';
import { RateLimitRetry } from './rate-limit-retry';
import {
  isStructuredValue,
  wrapStructured
} from '../../utils/structured-value';
import { wrapLoadContentValue } from '../../utils/load-content-structured';
import type { CommandExecutionContext } from '../../env/ErrorUtils';
import type { StreamEvent } from './stream-bus';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import type { ExecuteOptions, PipelineCommandExecutionContextFactory, StageExecutionResult } from './executor/types';
import {
  cloneStructuredValue,
  previewValue,
  safeJSONStringify,
  snippet
} from './executor/helpers';
import { PipelineOutputProcessor } from './executor/output-processor';
import { StageOutputCache } from './executor/stage-output-cache';
import { PipelineCommandArgumentBinder } from './executor/command-argument-binder';
import { PipelineCommandInvoker } from './executor/command-invoker';
import { PipelineInlineStageExecutor } from './executor/inline-stage-executor';
import { PipelineWhileStageAdapter } from './executor/while-stage-adapter';
import { PipelineSingleStageRunner } from './executor/single-stage-runner';
import { PipelineParallelStageRunner } from './executor/parallel-stage-runner';
import { PipelineExecutionLoopRunner } from './executor/execution-loop-runner';
import { PipelineStreamingLifecycle } from './executor/streaming-lifecycle';

export type { ExecuteOptions } from './executor/types';

let pipelineCounter = 0;

function createPipelineId(): string {
  pipelineCounter += 1;
  return `pipeline-${pipelineCounter}`;
}

/**
 * Pipeline Executor - Handles actual execution using state machine
 */
/**
 * Pipeline Executor
 * WHY: Drive stage execution using the state machine and construct proper stage environments.
 * CONTEXT: Re-runs inline effects per retry; empty output is treated as early termination.
 */
export class PipelineExecutor implements PipelineCommandExecutionContextFactory {
  private stateMachine: PipelineStateMachine;
  private env: Environment;
  private format?: string;
  private pipeline: PipelineStage[];
  private isRetryable: boolean;
  private sourceFunction?: () => Promise<string | StructuredValue>; // Store source function for retries
  private hasSyntheticSource: boolean;
  private parallelCap?: number;
  private delayMs?: number;
  private sourceExecutedOnce: boolean = false; // Track if source has been executed once
  private initialInputText: string = ''; // Store initial input for synthetic source
  private allRetryHistory: Map<string, StructuredValue[]> = new Map();
  private rateLimiter = new RateLimitRetry();
  private stageOutputs = new StageOutputCache();
  private outputProcessor: PipelineOutputProcessor;
  private readonly commandInvoker: PipelineCommandInvoker;
  private readonly inlineStageExecutor: PipelineInlineStageExecutor;
  private readonly whileStageAdapter: PipelineWhileStageAdapter;
  private readonly singleStageRunner: PipelineSingleStageRunner;
  private readonly parallelStageRunner: PipelineParallelStageRunner;
  private readonly executionLoopRunner: PipelineExecutionLoopRunner;
  private readonly streamingLifecycle: PipelineStreamingLifecycle;
  private readonly debugStructured = process.env.MLLD_DEBUG_STRUCTURED === 'true';
  private stageHookNodeCounter = 0;
  private pipelineId: string = createPipelineId();
  createCommandExecutionContext(
    stageIndex: number,
    stageContext: StageContext,
    parallelIndex?: number,
    directiveType?: string,
    workingDirectory?: string
  ): CommandExecutionContext {
    return {
      directiveType: directiveType || 'run',
      streamingEnabled: this.streamingLifecycle.isStageExecutionStreaming(this.pipeline[stageIndex]),
      pipelineId: this.pipelineId,
      stageIndex,
      parallelIndex,
      streamId: stageContext.contextId ?? createPipelineId(),
      workingDirectory
    };
  }

  constructor(
    pipeline: PipelineStage[],
    env: Environment,
    format?: string,
    isRetryable: boolean = false,
    sourceFunction?: () => Promise<string | StructuredValue>,
    hasSyntheticSource: boolean = false,
    parallelCap?: number,
    delayMs?: number,
    streamingManager?: StreamingManager
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
    this.stateMachine = new PipelineStateMachine(
      pipeline.length,
      isRetryable,
      Boolean(sourceFunction)
    );
    this.pipeline = pipeline;
    this.env = env;
    this.outputProcessor = new PipelineOutputProcessor(env);
    const argumentBinder = new PipelineCommandArgumentBinder();
    this.commandInvoker = new PipelineCommandInvoker(env, argumentBinder);
    this.inlineStageExecutor = new PipelineInlineStageExecutor(env, this.outputProcessor);
    this.whileStageAdapter = new PipelineWhileStageAdapter();
    this.singleStageRunner = new PipelineSingleStageRunner(this as any);
    this.parallelStageRunner = new PipelineParallelStageRunner(this as any);
    this.executionLoopRunner = new PipelineExecutionLoopRunner(this as any);
    this.format = format;
    this.isRetryable = isRetryable;
    this.sourceFunction = sourceFunction;
    this.hasSyntheticSource = hasSyntheticSource;
    this.parallelCap = parallelCap;
    this.delayMs = delayMs;
    this.streamingLifecycle = new PipelineStreamingLifecycle(
      pipeline,
      env,
      this.pipelineId,
      streamingManager
    );
  }

  private emitStream(event: Omit<StreamEvent, 'timestamp' | 'pipelineId'> & { timestamp?: number; pipelineId?: string }): void {
    this.streamingLifecycle.emit(event);
  }

  /**
   * Execute the pipeline
   */
  /**
   * Execute the pipeline until completion or error.
   * WHY: Convert state-machine steps into actual command execution and effect emission.
   */
  async execute(initialInput: string | StructuredValue): Promise<string>;
  async execute(initialInput: string | StructuredValue, options: { returnStructured: true }): Promise<StructuredValue>;
  async execute(initialInput: string | StructuredValue, options?: ExecuteOptions): Promise<string | StructuredValue> {
    try {
      return await this.executionLoopRunner.execute(initialInput, options);
    } finally {
      this.streamingLifecycle.teardown();
    }
  }

  private setInitialInputText(value: string): void {
    this.initialInputText = value;
  }

  private setAllRetryHistory(history: Map<string, StructuredValue[]>): void {
    this.allRetryHistory = history;
  }

  /**
   * Execute a single stage
   */
  /**
   * Execute a single pipeline stage with the constructed stage environment.
   * GOTCHA: Inline effects are run after successful stage execution and re-run on retries.
   */
  private async executeSingleStage(
    stageIndex: number,
    command: PipelineStageEntry,
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    return await this.singleStageRunner.execute(stageIndex, command, input, context);
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
    structuredInput: StructuredValue,
    stageEnv: Environment,
    operationContext?: OperationContext,
    hookNode?: ExecInvocation,
    stageIndex?: number,
    stageContext?: StageContext,
    parallelIndex?: number
  ): Promise<StageExecutionResult> {
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
        const initialOutput = this.stageOutputs.getInitialOutput();
        const sourceOutput = initialOutput
          ? cloneStructuredValue(initialOutput)
          : wrapStructured(this.initialInputText, 'text', this.initialInputText);
        return { result: sourceOutput };
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
      const freshWrapper = isStructuredValue(fresh)
        ? cloneStructuredValue(fresh)
        : wrapStructured(fresh, 'text', typeof fresh === 'string' ? fresh : safeJSONStringify(fresh));
      this.outputProcessor.applySourceDescriptor(freshWrapper, fresh);
      this.stageOutputs.updateInitialOutput(freshWrapper);
      this.initialInputText = freshWrapper.text;
      return { result: freshWrapper };
    }

    // Synthetic identity stage for pipelines that only have inline effects
    if (command.rawIdentifier === '__identity__') {
      return { result: input };
    }
    
    return await this.commandInvoker.invokeCommand({
      command,
      stageEnv,
      input,
      structuredInput,
      hookOptions: {
        hookNode,
        operationContext,
        stageInputs: [structuredInput],
        executionContext: stageContext && typeof stageIndex === 'number'
          ? this.createCommandExecutionContext(stageIndex, stageContext, parallelIndex, command.rawIdentifier)
          : undefined
      }
    });
  }

  private isRetrySignal(output: any): boolean {
    let isRetry = false;
    if (isStructuredValue(output)) {
      const data = output.data as unknown;
      isRetry =
        output.text === 'retry' ||
        typeof data === 'string' && data === 'retry' ||
        (data && typeof data === 'object' && (data as any).value === 'retry');
    } else {
      isRetry =
        output === 'retry' ||
        (output && typeof output === 'object' && (output as any).value === 'retry');
    }
    
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

  private createPipelineOperationContext(
    command: PipelineStageEntry,
    stageIndex: number,
    stageContext: StageContext
  ): OperationContext {
    const labels = (command as any)?.securityLabels as DataLabel[] | undefined;
    return {
      type: 'pipeline-stage',
      subtype: command.rawIdentifier,
      name: command.rawIdentifier,
      labels,
      metadata: {
        stageIndex: stageIndex + 1,
        totalStages: stageContext.totalStages,
        streaming: this.streamingLifecycle.isEnabled()
      }
    };
  }

  private async executeParallelStage(
    stageIndex: number,
    commands: PipelineStageEntry[],
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    return await this.parallelStageRunner.execute(stageIndex, commands, input, context);
  }

  private buildStageDescriptor(
    command: PipelineStageEntry,
    stageIndex: number,
    context: StageContext,
    _structuredInput: StructuredValue
  ): SecurityDescriptor | undefined {
    const labels = (command as any)?.securityLabels as DataLabel[] | undefined;
    if (labels && labels.length > 0) {
      return makeSecurityDescriptor({ labels });
    }
    return undefined;
  }

  /**
   * Execute pre-effects (leading effects that should run before the stage).
   * Pre-effects see @input as the output from the previous stage.
   */
  private async runPreEffects(
    command: any,
    stageInput: StructuredValue | string,
    stageEnv: Environment
  ): Promise<void> {
    if (!command?.preEffects || !Array.isArray(command.preEffects) || command.preEffects.length === 0) return;

    for (const effectCmd of command.preEffects) {
      try {
        if (!effectCmd?.rawIdentifier || !isBuiltinEffect(effectCmd.rawIdentifier)) continue;
        await runBuiltinEffect(effectCmd, stageInput, stageEnv);
      } catch (err) {
        // Fail-fast on effect errors
        if (err instanceof Error) {
          throw new MlldCommandExecutionError(
            `Pre-effect @${effectCmd.rawIdentifier} failed: ${err.message}`,
            undefined,
            {
              command: effectCmd.rawIdentifier,
              exitCode: 1,
              duration: 0,
              workingDirectory: this.env.getExecutionDirectory()
            }
          );
        }
        throw err;
      }
    }
  }

  /**
   * Execute any inline builtin effects attached to the command/stage.
   * Effects do not count as stages and run after successful execution.
   */
  private async runInlineEffects(
    command: any,
    stageOutput: StructuredValue | string,
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
              workingDirectory: this.env.getExecutionDirectory()
            }
          );
        }
        throw err;
      }
    }
  }

  private createStageHookNode(command: PipelineStageEntry): ExecInvocation {
    const nodeId = `pipeline-stage-${this.stageHookNodeCounter++}`;
    const commandRef: CommandReference = {
      type: 'CommandReference',
      nodeId: `${nodeId}-command`,
      identifier: command.rawIdentifier,
      args: [],
      fields: (command as any)?.fields
    };
    return {
      type: 'ExecInvocation',
      nodeId,
      commandRef,
      withClause: undefined,
      location: (command as any)?.location ?? (command as any)?.meta?.location
    };
  }

  private logStructuredStage(
    phase: 'input' | 'output',
    stageName: string,
    stageIndex: number,
    value: StructuredValue,
    isParallelBranch = false
  ): void {
    if (!this.debugStructured) {
      return;
    }
    try {
      console.error(`[PipelineExecutor][${phase}]`, {
        stage: stageName,
        stageIndex,
        parallel: isParallelBranch,
        labels: value?.mx?.labels ?? null,
        taint: value?.mx?.taint ?? null,
        metadataLabels: value?.metadata?.security?.labels ?? null
      });
      console.error('[PipelineExecutor][detail-start]', {
        phase,
        stage: stageName
      });
      console.error('[PipelineExecutor]', {
        phase,
        stage: stageName,
        stageIndex,
        parallel: isParallelBranch,
        type: value?.type,
        textSnippet: snippet(value?.text),
        dataPreview: previewValue(value?.data)
      });
      console.error('[PipelineExecutor][detail-end]', {
        phase,
        stage: stageName
      });
    } catch (error) {
      console.error('[PipelineExecutor][logStructuredStage:error]', {
        phase,
        stage: stageName,
        stageIndex,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  private debugNormalize(value: any): any {
    try {
      if (value === undefined || value === null) return value;
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        const base: any = { type: (value as any).type };
        if ((value as any).text !== undefined) base.text = (value as any).text;
        if ((value as any).data !== undefined && typeof (value as any).data !== 'object') {
          base.data = (value as any).data;
        }
        if (Array.isArray((value as any).mx?.labels)) {
          base.labels = (value as any).mx.labels;
        }
        return base;
      }
      return value;
    } catch {
      return '[unserializable]';
    }
  }
}
