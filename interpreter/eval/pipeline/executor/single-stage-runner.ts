import type { PipelineCommand, PipelineStageEntry, WhilePipelineStage, InlineValueStage, InlineCommandStage } from '@core/types';
import type { ExecInvocation } from '@core/types/primitives';
import type { OperationContext, PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { StageContext, StageResult } from '@interpreter/eval/pipeline/state-machine';
import type { StageExecutionResult } from './types';
import { createStageEnvironment } from '@interpreter/eval/pipeline/context-builder';
import { evaluateWhileStage } from '@interpreter/eval/while';
import { GuardError } from '@core/errors/GuardError';
import { logger } from '@core/utils/logger';
import { isRateLimitError, type RateLimitRetry } from '@interpreter/eval/pipeline/rate-limit-retry';

export interface PipelineSingleStageRuntime {
  env: Environment;
  format?: string;
  hasSyntheticSource: boolean;
  isRetryable: boolean;
  allRetryHistory: Map<string, StructuredValue[]>;
  stageOutputs: {
    get(stage: number, fallback: string): StructuredValue;
    peek(stage: number): StructuredValue | undefined;
    set(stage: number, output: StructuredValue): void;
    entries(): Array<[number, StructuredValue]>;
  };
  stateMachine: {
    getEvents(): any[];
  };
  outputProcessor: {
    normalizeOutput(output: unknown): StructuredValue;
    finalizeStageOutput(
      value: StructuredValue,
      stageInput: StructuredValue,
      rawOutput: unknown,
      ...descriptorHints: (SecurityDescriptor | undefined)[]
    ): StructuredValue;
  };
  inlineStageExecutor: {
    executeInlineCommandStage(request: {
      stage: InlineCommandStage;
      structuredInput: StructuredValue;
      stageEnv: Environment;
      operationContext?: OperationContext;
      stageIndex: number;
      stageContext: StageContext;
      contextFactory: any;
      parallelIndex?: number;
    }): Promise<StageExecutionResult>;
    executeInlineValueStage(
      stage: InlineValueStage,
      stageInput: StructuredValue,
      stageEnv: Environment
    ): Promise<StageExecutionResult>;
  };
  whileStageAdapter: {
    adaptProcessor(
      processor: any,
      value: StructuredValue | unknown
    ): {
      command: PipelineCommand;
      input: { structured: StructuredValue; text: string };
    };
  };
  rateLimiter: RateLimitRetry;
  debugStructured: boolean;
  createPipelineOperationContext(
    command: PipelineStageEntry,
    stageIndex: number,
    stageContext: StageContext
  ): OperationContext;
  createStageHookNode(command: PipelineStageEntry): ExecInvocation;
  buildStageDescriptor(
    command: PipelineStageEntry,
    stageIndex: number,
    stageContext: StageContext,
    structuredInput: StructuredValue
  ): SecurityDescriptor | undefined;
  executeCommand(
    command: PipelineCommand,
    input: string,
    structuredInput: StructuredValue,
    stageEnv: Environment,
    operationContext?: OperationContext,
    hookNode?: ExecInvocation,
    stageIndex?: number,
    stageContext?: StageContext,
    parallelIndex?: number
  ): Promise<StageExecutionResult>;
  runPreEffects(
    command: any,
    stageInput: StructuredValue | string,
    stageEnv: Environment
  ): Promise<void>;
  runInlineEffects(
    command: any,
    stageOutput: StructuredValue | string,
    stageEnv: Environment
  ): Promise<void>;
  isRetrySignal(output: any): boolean;
  parseRetryScope(output: any): number | undefined;
  parseRetryHint(output: any): any;
  logStructuredStage(
    phase: 'input' | 'output',
    stageName: string,
    stageIndex: number,
    value: StructuredValue,
    isParallelBranch?: boolean
  ): void;
  debugNormalize(value: any): any;
}

export class PipelineSingleStageRunner {
  constructor(private readonly runtime: PipelineSingleStageRuntime) {}

  async execute(
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
      const structuredInput = this.runtime.stageOutputs.get(stageIndex - 1, input);
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[DEBUG executeSingleStage] stageIndex:', stageIndex, 'command:', command.rawIdentifier);
        console.error('[DEBUG executeSingleStage] structuredInput from getStageOutput:', JSON.stringify(structuredInput?.data ?? structuredInput?.text ?? structuredInput));
        console.error('[DEBUG executeSingleStage] structuredOutputs cache:', this.runtime.stageOutputs.entries().map(([k, v]) => [k, v?.data ?? v?.text]));
      }
      this.runtime.logStructuredStage('input', command.rawIdentifier, stageIndex, structuredInput);
      if (process.env.MLLD_DEBUG === 'true') {
        try {
          const prevOut = this.runtime.stageOutputs.peek(stageIndex - 1);
          const currOut = this.runtime.stageOutputs.peek(stageIndex);
          console.error('[PipelineExecutor] Stage input snapshot', {
            stageIndex,
            command: command.rawIdentifier,
            input,
            structuredInput: this.runtime.debugNormalize(structuredInput),
            previousStageOutput: this.runtime.debugNormalize(prevOut),
            cachedCurrentOutput: this.runtime.debugNormalize(currOut)
          });
        } catch {}
      }
      parentPipelineContextPushed = true;
      stageEnv = await createStageEnvironment(
        command,
        input,
        structuredInput,
        context,
        this.runtime.env,
        this.runtime.format,
        this.runtime.stateMachine.getEvents(),
        this.runtime.hasSyntheticSource,
        this.runtime.allRetryHistory,
        {
          getStageOutput: (stage, fallback) => this.runtime.stageOutputs.get(stage, fallback)
        },
        {
          capturePipelineContext: snapshot => {
            pipelineSnapshot = snapshot;
          },
          skipSetPipelineContext: false,
          sourceRetryable: this.runtime.isRetryable
        }
      );
      if (!pipelineSnapshot) {
        throw new Error('Pipeline context snapshot unavailable for pipeline stage');
      }
      stageDescriptor = this.runtime.buildStageDescriptor(command, stageIndex, context, structuredInput);
      mxManager = stageEnv.getContextManager();
      const stageOpContext = this.runtime.createPipelineOperationContext(command, stageIndex, context);
      const stageHookNode = this.runtime.createStageHookNode(command);

      await this.runtime.runPreEffects(command, structuredInput, stageEnv!);

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
                  const adaptation = this.runtime.whileStageAdapter.adaptProcessor(processor, stateValue);
                  const execution = await this.runtime.executeCommand(
                    adaptation.command,
                    adaptation.input.text,
                    adaptation.input.structured,
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
              this.runtime.rateLimiter.reset();
              break;
            }
            if ((command as InlineValueStage).type === 'inlineValue') {
              stageExecution = await this.runtime.inlineStageExecutor.executeInlineValueStage(
                command as InlineValueStage,
                structuredInput,
                stageEnv!
              );
            } else if ((command as InlineCommandStage).type === 'inlineCommand') {
              stageExecution = await this.runtime.inlineStageExecutor.executeInlineCommandStage({
                stage: command as InlineCommandStage,
                structuredInput,
                stageEnv: stageEnv!,
                operationContext: stageOpContext,
                stageIndex,
                stageContext: context,
                contextFactory: this.runtime
              });
            } else {
              stageExecution = await this.runtime.executeCommand(
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
            this.runtime.rateLimiter.reset();
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
              const retry = await this.runtime.rateLimiter.wait();
              if (retry) continue;
            }
            throw err;
          }
        }

        if (!stageExecution) {
          throw new Error('Pipeline command did not produce a result');
        }
        const output = stageExecution.result;
        if (this.runtime.isRetrySignal(output)) {
          if (process.env.MLLD_DEBUG === 'true') {
            console.error('[PipelineExecutor] Retry detected at stage', context.stage);
          }
          const from = this.runtime.parseRetryScope(output);
          const hint = this.runtime.parseRetryHint(output);
          return { type: 'retry', reason: hint || 'Stage requested retry', from, hint } as StageResult;
        }

        let normalized = this.runtime.outputProcessor.normalizeOutput(output);
        if (this.runtime.debugStructured) {
          console.error('[PipelineExecutor][pre-output]', {
            stage: command.rawIdentifier,
            stageIndex
          });
        }
        this.runtime.logStructuredStage('output', command.rawIdentifier, stageIndex, normalized);
        if (this.runtime.debugStructured) {
          console.error('[PipelineExecutor][post-output]', {
            stage: command.rawIdentifier,
            stageIndex
          });
        }
        normalized = this.runtime.outputProcessor.finalizeStageOutput(
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
              normalized: this.runtime.debugNormalize(normalized)
            });
          } catch {}
        }
        if (this.runtime.debugStructured) {
          try {
            console.error('[PipelineExecutor][finalized-output]', {
              stage: command.rawIdentifier,
              stageIndex,
              labels: normalized?.mx?.labels ?? null,
              metadataLabels: normalized?.metadata?.security?.labels ?? null
            });
          } catch {}
        }
        this.runtime.stageOutputs.set(stageIndex, normalized);

        const normalizedText = normalized.text ?? '';
        if (!normalizedText || normalizedText.trim() === '') {
          await this.runtime.runInlineEffects(command, normalized, stageEnv!);
          return { type: 'success', output: normalizedText, structuredOutput: normalized };
        }

        try {
          const pmx = this.runtime.env.getPipelineContext?.();
          if (pmx) {
            this.runtime.env.updatePipelineContext({
              ...pmx,
              hint: null
            });
          }
        } catch {}

        await this.runtime.runInlineEffects(command, normalized, stageEnv!);
        return { type: 'success', output: normalizedText, structuredOutput: normalized };
      };

      const runWithinPipeline = async (): Promise<StageResult> => {
        if (mxManager) {
          return await mxManager.withOperation(stageOpContext, executeStage);
        }
        return await executeStage();
      };

      return await this.runtime.env.withPipeContext(pipelineSnapshot, runWithinPipeline);
    } catch (error) {
      return { type: 'error', error: error as Error };
    } finally {
      if (parentPipelineContextPushed && this.runtime.env.getPipelineContext()) {
        this.runtime.env.clearPipelineContext();
      }
    }
  }
}
