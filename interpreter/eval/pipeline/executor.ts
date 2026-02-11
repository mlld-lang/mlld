import type { Environment } from '../../env/Environment';
import type { PipelineCommand, PipelineStage, PipelineStageEntry, InlineCommandStage, InlineValueStage, WhilePipelineStage } from '@core/types';
import type { ExecInvocation, CommandReference } from '@core/types/primitives';
import type { OperationContext, PipelineContextSnapshot } from '../../env/ContextManager';
import type { StructuredValue } from '../../utils/structured-value';
import type { SecurityDescriptor, DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { getOperationLabels, parseCommand } from '@core/policy/operation-labels';
import { evaluateCommandAccess } from '@core/policy/guards';

// Import pipeline implementation
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { createStageEnvironment } from './context-builder';
import { GuardError } from '@core/errors/GuardError';
import { MlldCommandExecutionError, MlldSecurityError } from '@core/errors';
import { runBuiltinEffect, isBuiltinEffect } from './builtin-effects';
import { RateLimitRetry, isRateLimitError } from './rate-limit-retry';
import { logger } from '@core/utils/logger';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import {
  asData,
  isStructuredValue,
  wrapStructured,
  extractSecurityDescriptor,
  applySecurityDescriptorToStructuredValue
} from '../../utils/structured-value';
import { wrapLoadContentValue } from '../../utils/load-content-structured';
import { setExpressionProvenance } from '../../utils/expression-provenance';
import type { CommandExecutionContext } from '../../env/ErrorUtils';
import { InterpolationContext } from '../../core/interpolation-context';
import { StreamBus, type StreamEvent } from './stream-bus';
import type { StreamingOptions } from './streaming-options';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import { resolveWorkingDirectory } from '../../utils/working-directory';
import { evaluateWhileStage } from '../while';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import type { ParallelStageError, RetrySignal, StageExecutionResult } from './executor/types';
import {
  cloneStructuredValue,
  extractStageValue,
  formatParallelStageError,
  getStructuredSecurityDescriptor,
  previewValue,
  resetParallelErrorsContext,
  safeJSONStringify,
  snippet
} from './executor/helpers';
import { PipelineOutputProcessor } from './executor/output-processor';
import { StageOutputCache } from './executor/stage-output-cache';
import { PipelineCommandArgumentBinder } from './executor/command-argument-binder';
import { PipelineCommandInvoker } from './executor/command-invoker';

export interface ExecuteOptions {
  returnStructured?: boolean;
  stream?: boolean;
}

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
export class PipelineExecutor {
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
  private readonly debugStructured = process.env.MLLD_DEBUG_STRUCTURED === 'true';
  private stageHookNodeCounter = 0;
  private streamingOptions: StreamingOptions;
  private pipelineId: string = createPipelineId();
  private bus: StreamBus;
  private streamingManager: StreamingManager;
  private streamingEnabled: boolean;
  private buildCommandExecutionContext(
    stageIndex: number,
    stageContext: StageContext,
    parallelIndex?: number,
    directiveType?: string,
    workingDirectory?: string
  ): CommandExecutionContext {
    const stageStreaming = this.isStageStreaming(this.pipeline[stageIndex]);
    return {
      directiveType: directiveType || 'run',
      streamingEnabled: this.streamingEnabled && stageStreaming,
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
    this.format = format;
    this.isRetryable = isRetryable;
    this.sourceFunction = sourceFunction;
    this.hasSyntheticSource = hasSyntheticSource;
    this.parallelCap = parallelCap;
    this.delayMs = delayMs;
    this.streamingOptions = env.getStreamingOptions();
    this.streamingEnabled = this.streamingOptions.enabled !== false && this.pipelineHasStreamingStage(pipeline);
    this.streamingManager = streamingManager ?? env.getStreamingManager();
    this.bus = this.streamingManager.getBus();
    if (this.streamingEnabled && !this.streamingOptions.skipDefaultSinks) {
      this.streamingManager.configure({
        env: this.env,
        streamingEnabled: true,
        streamingOptions: this.streamingOptions
      });
    }
  }

  private emitStream(event: Omit<StreamEvent, 'timestamp' | 'pipelineId'> & { timestamp?: number; pipelineId?: string }): void {
    if (!this.streamingEnabled) {
      return;
    }
    this.bus.emit({
      ...event,
      pipelineId: event.pipelineId || this.pipelineId,
      timestamp: event.timestamp ?? Date.now()
    } as StreamEvent);
  }

  private isStageStreaming(stage: PipelineStageEntry | PipelineStageEntry[]): boolean {
    if (Array.isArray(stage)) {
      return stage.some(st => this.isStageStreaming(st));
    }
    const candidate = stage as any;
    return Boolean(
      candidate?.stream ||
      candidate?.withClause?.stream ||
      candidate?.meta?.withClause?.stream
    );
  }

  private pipelineHasStreamingStage(pipeline: PipelineStage[]): boolean {
    return pipeline.some(stage => this.isStageStreaming(stage));
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
    this.env.resetPipelineGuardHistory();
    try {
      const initialWrapper = isStructuredValue(initialInput)
        ? cloneStructuredValue(initialInput)
        : wrapStructured(initialInput, 'text', typeof initialInput === 'string' ? initialInput : safeJSONStringify(initialInput));
      this.outputProcessor.applySourceDescriptor(initialWrapper, initialInput);

      // Store initial input for synthetic source stage
      this.initialInputText = initialWrapper.text;
      this.stageOutputs.initialize(initialWrapper);
      const initialStructured = this.stageOutputs.getInitialOutput();
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Pipeline start:', {
          stages: this.pipeline.map(p => Array.isArray(p) ? '[parallel]' : p.rawIdentifier),
          hasSyntheticSource: this.hasSyntheticSource,
          isRetryable: this.isRetryable
        });
      }
      this.emitStream({ type: 'PIPELINE_START', source: 'pipeline' });
      
      // Start the pipeline
      let nextStep = this.stateMachine.transition({
        type: 'START',
        input: this.initialInputText,
        structuredInput: initialStructured ? cloneStructuredValue(initialStructured) : undefined
      });
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

        // Clear cached outputs for this stage and downstream when retrying to avoid stale inputs
        this.stageOutputs.clearFrom(nextStep.stage);
        
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Execute stage:', {
            stage: nextStep.stage,
            contextId: nextStep.context.contextId,
            contextAttempt: nextStep.context.contextAttempt,
            inputLength: nextStep.input?.length,
            commandId: this.pipeline[nextStep.stage]?.rawIdentifier
          });
        }
        this.emitStream({
          type: 'STAGE_START',
          stageIndex: nextStep.stage,
          command: this.pipeline[nextStep.stage],
          contextId: nextStep.context.contextId,
          attempt: nextStep.context.contextAttempt
        });
        const stageStartTime = Date.now();

        const stageEntry = this.pipeline[nextStep.stage];
        const result = Array.isArray(stageEntry)
          ? await this.executeParallelStage(nextStep.stage, stageEntry, nextStep.input, nextStep.context)
          : await this.executeSingleStage(nextStep.stage, stageEntry, nextStep.input, nextStep.context);
        
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Stage result:', {
            resultType: result.type,
            isRetry: result.type === 'retry'
          });
        }
        if (result.type === 'success') {
          const stageEntry = this.pipeline[nextStep.stage];
          this.emitStream({
            type: 'STAGE_SUCCESS',
            stageIndex: nextStep.stage,
            durationMs: Date.now() - stageStartTime
          });
        } else if (result.type === 'error') {
          this.emitStream({
            type: 'STAGE_FAILURE',
            stageIndex: nextStep.stage,
            error: result.error
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
          this.emitStream({ type: 'PIPELINE_COMPLETE' });
          if (options?.returnStructured) {
            return this.stageOutputs.getFinal();
          }
          return nextStep.output;
        
        case 'ERROR':
          this.emitStream({ type: 'PIPELINE_ABORT', reason: nextStep.error.message });
          throw new MlldCommandExecutionError(
            `Pipeline failed at stage ${nextStep.stage + 1}: ${nextStep.error.message}`,
            undefined,
            {
              command: this.pipeline[nextStep.stage]?.rawIdentifier || 'unknown',
              exitCode: 1,
              duration: 0,
              workingDirectory: this.env.getExecutionDirectory()
            }
          );
        
        case 'ABORT':
          this.emitStream({ type: 'PIPELINE_ABORT', reason: nextStep.reason || 'aborted' });
          throw new MlldCommandExecutionError(
            `Pipeline aborted: ${nextStep.reason}`,
            undefined,
            {
              command: 'pipeline',
              exitCode: 1,
              duration: 0,
              workingDirectory: this.env.getExecutionDirectory()
            }
          );
        
        default:
          throw new Error('Pipeline ended in unexpected state');
      }
    } finally {
      if (this.streamingEnabled && !this.streamingOptions.skipDefaultSinks) {
        try {
          this.streamingManager.teardown();
        } catch {
          // ignore teardown errors
        }
      }
    }
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
    let stageEnv: Environment | undefined;
    let mxManager: ReturnType<Environment['getContextManager']> | undefined;
    let pipelineSnapshot: PipelineContextSnapshot | undefined;
    let stageDescriptor: SecurityDescriptor | undefined;
    let parentPipelineContextPushed = false;

    try {
      const structuredInput = this.stageOutputs.get(stageIndex - 1, input);
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[DEBUG executeSingleStage] stageIndex:', stageIndex, 'command:', command.rawIdentifier);
        console.error('[DEBUG executeSingleStage] structuredInput from getStageOutput:', JSON.stringify(structuredInput?.data ?? structuredInput?.text ?? structuredInput));
        console.error('[DEBUG executeSingleStage] structuredOutputs cache:', this.stageOutputs.entries().map(([k, v]) => [k, v?.data ?? v?.text]));
      }
      this.logStructuredStage('input', command.rawIdentifier, stageIndex, structuredInput);
      if (process.env.MLLD_DEBUG === 'true') {
        try {
          const prevOut = this.stageOutputs.peek(stageIndex - 1);
          const currOut = this.stageOutputs.peek(stageIndex);
          console.error('[PipelineExecutor] Stage input snapshot', {
            stageIndex,
            command: command.rawIdentifier,
            input,
            structuredInput: this.debugNormalize(structuredInput),
            previousStageOutput: this.debugNormalize(prevOut),
            cachedCurrentOutput: this.debugNormalize(currOut)
          });
        } catch {}
      }
      // Set up execution environment for a single command stage
      parentPipelineContextPushed = true;
      stageEnv = await createStageEnvironment(
        command,
        input,
        structuredInput,
        context,
        this.env,
        this.format,
        this.stateMachine.getEvents(),
        this.hasSyntheticSource,
        this.allRetryHistory,
        {
          getStageOutput: (stage, fallback) => this.stageOutputs.get(stage, fallback)
        },
        {
          capturePipelineContext: snapshot => {
            pipelineSnapshot = snapshot;
          },
          skipSetPipelineContext: false,
          sourceRetryable: this.isRetryable
        }
      );
      if (!pipelineSnapshot) {
        throw new Error('Pipeline context snapshot unavailable for pipeline stage');
      }
      stageDescriptor = this.buildStageDescriptor(command, stageIndex, context, structuredInput);
      mxManager = stageEnv.getContextManager();
      const stageOpContext = this.createPipelineOperationContext(command, stageIndex, context);

      const stageHookNode = this.createStageHookNode(command);

      // Run pre-effects (leading effects that should run before the stage)
      await this.runPreEffects(command, structuredInput, stageEnv!);

      const executeStage = async (): Promise<StageResult> => {
        let stageExecution: StageExecutionResult | undefined;
        while (true) {
          try {
            if ((command as WhilePipelineStage).type === 'whileStage') {
              const whileStage = command as WhilePipelineStage;
              const whileResult = await evaluateWhileStage(
                whileStage,
                structuredInput,
                stageEnv!,
                async (processor, stateValue, iterEnv) => {
                  const processorCommand = this.buildWhileProcessorCommand(processor);
                  const normalizedState = this.normalizeWhileInput(stateValue);
                  const execution = await this.executeCommand(
                    processorCommand,
                    normalizedState.text,
                    normalizedState.structured,
                    iterEnv,
                    stageOpContext,
                    stageHookNode,
                    stageIndex,
                    context
                  );
                  return { value: execution.result, env: iterEnv };
                }
              );
              stageExecution = {
                result: whileResult
              };
              this.rateLimiter.reset();
              break;
            }
            if ((command as InlineValueStage).type === 'inlineValue') {
              stageExecution = await this.executeInlineValueStage(
                command as InlineValueStage,
                structuredInput,
                stageEnv!
              );
            } else if ((command as InlineCommandStage).type === 'inlineCommand') {
              stageExecution = await this.executeInlineCommandStage(
                command as InlineCommandStage,
                structuredInput,
                stageEnv!,
                stageOpContext,
                stageHookNode,
                stageIndex,
                context
              );
            } else {
              stageExecution = await this.executeCommand(
                command as PipelineCommand,
                input,
                structuredInput,
                stageEnv!,
                stageOpContext,
                stageHookNode,
                stageIndex,
                context
              );
            }
            const output = stageExecution.result;
            this.rateLimiter.reset();
            break;
          } catch (err: any) {
            if (err instanceof GuardError) {
              if (err.decision === 'retry') {
                return {
                  type: 'retry',
                  reason: err.message,
                  hint: err.retryHint
                };
              }
              throw err;
            }
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

        if (!stageExecution) {
          throw new Error('Pipeline command did not produce a result');
        }
        const output = stageExecution.result;
        if (this.isRetrySignal(output)) {
          if (process.env.MLLD_DEBUG === 'true') {
            console.error('[PipelineExecutor] Retry detected at stage', context.stage);
          }
          const from = this.parseRetryScope(output);
          const hint = this.parseRetryHint(output);
          return { type: 'retry', reason: hint || 'Stage requested retry', from, hint } as StageResult;
        }

        let normalized = this.outputProcessor.normalizeOutput(output);
        if (this.debugStructured) {
          console.error('[PipelineExecutor][pre-output]', {
            stage: command.rawIdentifier,
            stageIndex
          });
        }
        this.logStructuredStage('output', command.rawIdentifier, stageIndex, normalized);
        if (this.debugStructured) {
          console.error('[PipelineExecutor][post-output]', {
            stage: command.rawIdentifier,
            stageIndex
          });
        }
        normalized = this.outputProcessor.finalizeStageOutput(
          normalized,
          structuredInput,
          output,
          stageDescriptor,
          stageExecution?.labelDescriptor
        );
        if (process.env.MLLD_DEBUG === 'true') {
          try {
            console.error('[PipelineExecutor] Stage output snapshot', {
              stageIndex,
              command: command.rawIdentifier,
              normalized: this.debugNormalize(normalized)
            });
          } catch {}
        }
        if (this.debugStructured) {
          try {
            console.error('[PipelineExecutor][finalized-output]', {
              stage: command.rawIdentifier,
              stageIndex,
              labels: normalized?.mx?.labels ?? null,
              metadataLabels: normalized?.metadata?.security?.labels ?? null
            });
          } catch {}
        }
        this.stageOutputs.set(stageIndex, normalized);

        const normalizedText = normalized.text ?? '';
        if (!normalizedText || normalizedText.trim() === '') {
          await this.runInlineEffects(command, normalized, stageEnv!);
          return { type: 'success', output: normalizedText, structuredOutput: normalized };
        }

        try {
          const pmx = this.env.getPipelineContext?.();
          if (pmx) {
            this.env.updatePipelineContext({
              ...pmx,
              hint: null
            });
          }
        } catch {}

        await this.runInlineEffects(command, normalized, stageEnv!);
        return { type: 'success', output: normalizedText, structuredOutput: normalized };
      };

      const runWithinPipeline = async (): Promise<StageResult> => {
        if (mxManager) {
          return await mxManager.withOperation(stageOpContext, executeStage);
        }
        return await executeStage();
      };

      return await this.env.withPipeContext(pipelineSnapshot, runWithinPipeline);
    } catch (error) {
      return { type: 'error', error: error as Error };
    } finally {
      // Ensure the parent environment does not retain the pipeline context after this stage
      if (parentPipelineContextPushed && this.env.getPipelineContext()) {
        this.env.clearPipelineContext();
      }
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
          ? this.buildCommandExecutionContext(stageIndex, stageContext, parallelIndex, command.rawIdentifier)
          : undefined
      }
    });
  }

  private async executeInlineCommandStage(
    stage: InlineCommandStage,
    structuredInput: StructuredValue,
    stageEnv: Environment,
    operationContext: OperationContext | undefined,
    hookNode: ExecInvocation | undefined,
    stageIndex: number,
    stageContext: StageContext,
    parallelIndex?: number
  ): Promise<StageExecutionResult> {
    const mxManager = stageEnv.getContextManager();
    const runInline = async (): Promise<StageExecutionResult> => {
      const { interpolate } = await import('../../core/interpreter');
      const descriptors: SecurityDescriptor[] = [];
      const workingDirectory = await resolveWorkingDirectory(stage.workingDir as any, stageEnv, {
        sourceLocation: stage.location,
        directiveType: 'run'
      });
      const commandText = await interpolate(stage.command, stageEnv, InterpolationContext.ShellCommand, {
        collectSecurityDescriptor: d => {
          if (d) descriptors.push(d);
        }
      });
      const parsedCommand = parseCommand(commandText);
      const opLabels = getOperationLabels({
        type: 'cmd',
        command: parsedCommand.command,
        subcommand: parsedCommand.subcommand
      });
      if (operationContext) {
        operationContext.command = commandText;
        operationContext.opLabels = opLabels;
        const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
        metadata.commandPreview = commandText;
        operationContext.metadata = metadata;
      }
      stageEnv.updateOpContext({ command: commandText, opLabels });
      const policySummary = stageEnv.getPolicySummary();
      if (policySummary) {
        const decision = evaluateCommandAccess(policySummary, commandText);
        if (!decision.allowed) {
          throw new MlldSecurityError(
            decision.reason ?? `Command '${decision.commandName}' denied by policy`,
            {
              code: 'POLICY_CAPABILITY_DENIED',
              sourceLocation: stage.location,
              env: stageEnv
            }
          );
        }
      }
      const commandDescriptor =
        descriptors.length > 1 ? stageEnv.mergeSecurityDescriptors(...descriptors) : descriptors[0];
      const stdinDescriptor = extractSecurityDescriptor(structuredInput, {
        recursive: true,
        mergeArrayElements: true
      });
      const inputDescriptor =
        commandDescriptor && stdinDescriptor
          ? stageEnv.mergeSecurityDescriptors(commandDescriptor, stdinDescriptor)
          : commandDescriptor ?? stdinDescriptor;
      const inputTaint = descriptorToInputTaint(inputDescriptor);
      if (inputTaint.length > 0) {
        const policyEnforcer = new PolicyEnforcer(stageEnv.getPolicySummary());
        policyEnforcer.checkLabelFlow(
          {
            inputTaint,
            opLabels,
            exeLabels: Array.from(stageEnv.getEnclosingExeLabels()),
            flowChannel: 'stdin',
            command: parsedCommand.command
          },
          { env: stageEnv, sourceLocation: stage.location }
        );
      }
      const stdinInput = structuredInput?.text ?? '';
      const result = await stageEnv.executeCommand(
        commandText,
        { input: stdinInput, ...(workingDirectory ? { workingDirectory } : {}) },
        this.buildCommandExecutionContext(stageIndex, stageContext, parallelIndex, undefined, workingDirectory)
      );
      const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
      const normalizedResult = processCommandOutput(result);
      const labelDescriptor =
        descriptors.length > 1 ? stageEnv.mergeSecurityDescriptors(...descriptors) : descriptors[0];
      return { result: normalizedResult, labelDescriptor };
    };
    if (mxManager && operationContext) {
      return await mxManager.withOperation(operationContext, runInline);
    }
    return await runInline();
  }

  private async executeInlineValueStage(
    stage: InlineValueStage,
    stageInput: StructuredValue,
    stageEnv: Environment
  ): Promise<StageExecutionResult> {
    const { evaluateDataValue } = await import('../data-value-evaluator');
    const value = await evaluateDataValue(stage.value, stageEnv);
    const text = safeJSONStringify(value);
    const wrapped = wrapStructured(value, 'object', text);
    const descriptor = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
    if (descriptor) {
      applySecurityDescriptorToStructuredValue(wrapped, descriptor);
      setExpressionProvenance(wrapped, descriptor);
    }
    const mergedDescriptor =
      descriptor && stageEnv ? stageEnv.mergeSecurityDescriptors(descriptor) : descriptor;
    return {
      result: this.outputProcessor.finalizeStageOutput(wrapped, stageInput, value, mergedDescriptor),
      labelDescriptor: mergedDescriptor
    };
  }

  private normalizeWhileInput(value: StructuredValue | unknown): { structured: StructuredValue; text: string } {
    if (isStructuredValue(value)) {
      const textValue = value.text ?? safeJSONStringify(asData(value));
      return { structured: value, text: textValue };
    }

    const textValue = typeof value === 'string' ? value : safeJSONStringify(value);
    const kind: StructuredValue['type'] =
      Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text';
    const structured = wrapStructured(value as any, kind, textValue);
    return { structured, text: textValue };
  }

  private buildWhileProcessorCommand(processor: any): PipelineCommand {
    if (processor?.type === 'ExecInvocation') {
      const ref = processor.commandRef || {};
      const identifier = Array.isArray(ref.identifier)
        ? ref.identifier
        : ref.identifier
          ? [ref.identifier]
          : [];
      const rawIdentifier =
        ref.name ||
        (Array.isArray(ref.identifier)
          ? ref.identifier.map((id: any) => id.identifier || id.content || '').find(Boolean)
          : ref.identifier) ||
        'while-processor';
      const rawArgs = (ref.args || []).map((arg: any) => {
        if (arg && typeof arg === 'object') {
          if ('content' in arg && typeof (arg as any).content === 'string') {
            return (arg as any).content;
          }
          if ((arg as any).identifier) {
            return `@${(arg as any).identifier}`;
          }
        }
        return '';
      });
      const command: PipelineCommand & { stream?: boolean } = {
        identifier,
        args: ref.args || [],
        fields: ref.fields || [],
        rawIdentifier,
        rawArgs,
        meta: {}
      };
      if (processor.withClause && processor.withClause.stream !== undefined) {
        command.stream = processor.withClause.stream;
      }
      return command;
    }

    if (processor?.type === 'VariableReferenceWithTail') {
      const variable = (processor as any).variable || processor;
      const rawIdentifier = variable?.identifier || 'while-processor';
      return {
        identifier: variable ? [variable] : [],
        args: [],
        fields: variable?.fields || [],
        rawIdentifier,
        rawArgs: []
      };
    }

    if (processor?.type === 'VariableReference') {
      return {
        identifier: [processor],
        args: [],
        fields: processor.fields || [],
        rawIdentifier: processor.identifier || 'while-processor',
        rawArgs: []
      };
    }

    const fallbackId =
      (processor && typeof processor === 'object' && 'identifier' in processor && (processor as any).identifier) ||
      (processor && typeof processor === 'object' && 'rawIdentifier' in processor && (processor as any).rawIdentifier) ||
      'while-processor';
    return {
      identifier: [],
      args: [],
      fields: [],
      rawIdentifier: fallbackId as string,
      rawArgs: []
    };
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
        streaming: this.streamingEnabled
      }
    };
  }

  private async executeParallelStage(
    stageIndex: number,
    commands: PipelineStageEntry[],
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      const errors: ParallelStageError[] = [];
      resetParallelErrorsContext(this.env, errors);
      const sharedStructuredInput = this.stageOutputs.get(stageIndex - 1, input);
      const results = await runWithConcurrency(
        commands,
        Math.min(this.parallelCap ?? getParallelLimit(), commands.length),
        async (cmd, parallelIndex) => {
          const branchInput = cloneStructuredValue(sharedStructuredInput);
          this.logStructuredStage('input', cmd.rawIdentifier, stageIndex, branchInput, true);
          let pipelineSnapshot: PipelineContextSnapshot | undefined;
          const subEnv = await createStageEnvironment(
            cmd,
            input,
            branchInput,
            context,
            this.env,
            this.format,
            this.stateMachine.getEvents(),
            this.hasSyntheticSource,
            this.allRetryHistory,
            {
              getStageOutput: (stage, fallback) => this.stageOutputs.get(stage, fallback)
            },
            {
              capturePipelineContext: snapshot => {
                pipelineSnapshot = snapshot;
              },
              skipSetPipelineContext: false,
              sourceRetryable: this.isRetryable
            }
          );

          if (!pipelineSnapshot) {
            throw new Error('Pipeline context snapshot unavailable for parallel branch');
          }

          const branchCtxManager = subEnv.getContextManager();
          const stageDescriptor = this.buildStageDescriptor(cmd, stageIndex, context, branchInput);

          const branchOpContext = this.createPipelineOperationContext(cmd, stageIndex, context);
          const branchHookNode = this.createStageHookNode(cmd);

          const executeBranch = async (): Promise<{ normalized: StructuredValue; labels?: SecurityDescriptor } | { value: 'retry'; hint?: any; from?: number }> => {
            try {
              const stageExecution =
                (cmd as InlineValueStage).type === 'inlineValue'
                  ? await this.executeInlineValueStage(cmd as InlineValueStage, branchInput, subEnv)
                  : (cmd as InlineCommandStage).type === 'inlineCommand'
                    ? await this.executeInlineCommandStage(
                        cmd as InlineCommandStage,
                        branchInput,
                        subEnv,
                        branchOpContext,
                        branchHookNode,
                        stageIndex,
                        context,
                        parallelIndex
                      )
                    : await this.executeCommand(
                        cmd as PipelineCommand,
                        input,
                        branchInput,
                        subEnv,
                        branchOpContext,
                        branchHookNode,
                        stageIndex,
                        context,
                        parallelIndex
                      );
              if (this.isRetrySignal(stageExecution.result)) {
                return stageExecution.result as RetrySignal;
              }
              let normalized = this.outputProcessor.normalizeOutput(stageExecution.result);
              this.logStructuredStage('output', cmd.rawIdentifier, stageIndex, normalized, true);
              normalized = this.outputProcessor.finalizeStageOutput(
                normalized,
                branchInput,
                stageExecution.result,
                stageDescriptor,
                stageExecution.labelDescriptor
              );
              await this.runInlineEffects(cmd, normalized, subEnv);
              return { normalized, labels: stageExecution.labelDescriptor };
            } catch (err) {
              const message = formatParallelStageError(err);
              const marker: ParallelStageError = {
                index: parallelIndex,
                key: parallelIndex,
                message,
                error: message,
                value: extractStageValue(branchInput)
              };
              errors.push(marker);
              const markerText = safeJSONStringify(marker);
              const normalized = wrapStructured(marker, 'object', markerText);
              this.logStructuredStage('output', cmd.rawIdentifier, stageIndex, normalized, true);
              return { normalized };
            }
          };

          return await this.env.withPipeContext(pipelineSnapshot, async () => {
            if (branchCtxManager) {
              return await branchCtxManager.withOperation(branchOpContext, executeBranch);
            }
            return await executeBranch();
          });
        },
        { ordered: true, paceMs: this.delayMs }
      );

      const retrySignal = results.find(res => this.isRetrySignal(res as any));
      if (retrySignal) {
        return { type: 'error', error: new Error('retry not supported in parallel stage') };
      }

      const branchPayloads = results as Array<{ normalized: StructuredValue; labels?: SecurityDescriptor }>;
      if (errors.length === 0) {
        for (let i = 0; i < branchPayloads.length; i++) {
          const candidate = extractStageValue(branchPayloads[i].normalized);
          if (candidate && typeof candidate === 'object' && 'message' in (candidate as any) && 'error' in (candidate as any)) {
            const marker: ParallelStageError = {
              index: typeof (candidate as any).index === 'number' ? (candidate as any).index : i,
              key: (candidate as any).key ?? i,
              message: String((candidate as any).message ?? (candidate as any).error),
              error: String((candidate as any).error ?? (candidate as any).message),
              value: (candidate as any).value
            };
            errors.push(marker);
          }
        }
      }
      resetParallelErrorsContext(this.env, errors);

      const aggregatedData = branchPayloads.map(result => extractStageValue(result.normalized));
      const aggregatedText = safeJSONStringify(aggregatedData);
      const aggregatedBase = wrapStructured(aggregatedData, 'array', aggregatedText, {
        stages: branchPayloads.map(result => result.normalized),
        errors
      });
      const stageDescriptors = branchPayloads
        .map(result => result.labels ?? getStructuredSecurityDescriptor(result.normalized))
        .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
      const aggregatedDescriptor = stageDescriptors.length > 0
        ? mergeDescriptors(...stageDescriptors)
        : undefined;
      const aggregated = this.outputProcessor.finalizeStageOutput(
        aggregatedBase,
        sharedStructuredInput,
        aggregatedData,
        aggregatedDescriptor
      );
      this.stageOutputs.set(stageIndex, aggregated);
      return { type: 'success', output: aggregated.text, structuredOutput: aggregated };
    } catch (err) {
      return { type: 'error', error: err as Error };
    }
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
