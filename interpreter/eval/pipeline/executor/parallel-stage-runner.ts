import type { PipelineCommand, PipelineStageEntry, InlineCommandStage, InlineValueStage } from '@core/types';
import type { ExecInvocation } from '@core/types/primitives';
import type { OperationContext, PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import type { SecurityDescriptor } from '@core/types/security';
import { mergeDescriptors } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { wrapStructured } from '@interpreter/utils/structured-value';
import type { StageContext, StageResult } from '@interpreter/eval/pipeline/state-machine';
import type { ParallelStageError, RetrySignal, StageExecutionResult } from './types';
import { createStageEnvironment } from '@interpreter/eval/pipeline/context-builder';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import {
  cloneStructuredValue,
  extractStageValue,
  formatParallelStageError,
  getStructuredSecurityDescriptor,
  resetParallelErrorsContext,
  safeJSONStringify
} from './helpers';

interface ParallelBranchResult {
  normalized: StructuredValue;
  labels?: SecurityDescriptor;
}

type ParallelBranchOutput = ParallelBranchResult | RetrySignal;

export interface PipelineParallelStageRuntime {
  env: Environment;
  format?: string;
  hasSyntheticSource: boolean;
  isRetryable: boolean;
  parallelCap?: number;
  delayMs?: number;
  allRetryHistory: Map<string, StructuredValue[]>;
  stageOutputs: {
    get(stage: number, fallback: string): StructuredValue;
    set(stage: number, output: StructuredValue): void;
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
  runInlineEffects(
    command: any,
    stageOutput: StructuredValue | string,
    stageEnv: Environment
  ): Promise<void>;
  isRetrySignal(output: any): boolean;
  logStructuredStage(
    phase: 'input' | 'output',
    stageName: string,
    stageIndex: number,
    value: StructuredValue,
    isParallelBranch?: boolean
  ): void;
}

export class PipelineParallelStageRunner {
  constructor(private readonly runtime: PipelineParallelStageRuntime) {}

  async execute(
    stageIndex: number,
    commands: PipelineStageEntry[],
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      const errors: ParallelStageError[] = [];
      resetParallelErrorsContext(this.runtime.env, errors);

      const sharedStructuredInput = this.runtime.stageOutputs.get(stageIndex - 1, input);
      const results = await runWithConcurrency<PipelineStageEntry, ParallelBranchOutput>(
        commands,
        Math.min(this.runtime.parallelCap ?? getParallelLimit(), commands.length),
        async (command, parallelIndex) => {
          return await this.executeBranch(
            command,
            parallelIndex,
            stageIndex,
            input,
            context,
            sharedStructuredInput,
            errors
          );
        },
        { ordered: true, paceMs: this.runtime.delayMs }
      );

      const retrySignal = results.find(result => this.runtime.isRetrySignal(result as any));
      if (retrySignal) {
        return { type: 'error', error: new Error('retry not supported in parallel stage') };
      }

      const branchPayloads = results as ParallelBranchResult[];
      this.collectBranchErrorMarkers(branchPayloads, errors);
      resetParallelErrorsContext(this.runtime.env, errors);

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
      const aggregated = this.runtime.outputProcessor.finalizeStageOutput(
        aggregatedBase,
        sharedStructuredInput,
        aggregatedData,
        aggregatedDescriptor
      );
      this.runtime.stageOutputs.set(stageIndex, aggregated);
      return { type: 'success', output: aggregated.text, structuredOutput: aggregated };
    } catch (error) {
      return { type: 'error', error: error as Error };
    }
  }

  private async executeBranch(
    command: PipelineStageEntry,
    parallelIndex: number,
    stageIndex: number,
    input: string,
    context: StageContext,
    sharedStructuredInput: StructuredValue,
    errors: ParallelStageError[]
  ): Promise<ParallelBranchOutput> {
    const branchInput = cloneStructuredValue(sharedStructuredInput);
    this.runtime.logStructuredStage('input', command.rawIdentifier, stageIndex, branchInput, true);

    let pipelineSnapshot: PipelineContextSnapshot | undefined;
    const subEnv = await createStageEnvironment(
      command,
      input,
      branchInput,
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
      throw new Error('Pipeline context snapshot unavailable for parallel branch');
    }

    const branchContextManager = subEnv.getContextManager();
    const stageDescriptor = this.runtime.buildStageDescriptor(command, stageIndex, context, branchInput);
    const branchOperationContext = this.runtime.createPipelineOperationContext(command, stageIndex, context);
    const branchHookNode = this.runtime.createStageHookNode(command);

    const runBranch = async (): Promise<ParallelBranchOutput> => {
      try {
        const stageExecution = await this.executeBranchCommand(
          command,
          input,
          branchInput,
          subEnv,
          branchOperationContext,
          branchHookNode,
          stageIndex,
          context,
          parallelIndex
        );
        if (this.runtime.isRetrySignal(stageExecution.result)) {
          return stageExecution.result as RetrySignal;
        }

        let normalized = this.runtime.outputProcessor.normalizeOutput(stageExecution.result);
        this.runtime.logStructuredStage('output', command.rawIdentifier, stageIndex, normalized, true);
        normalized = this.runtime.outputProcessor.finalizeStageOutput(
          normalized,
          branchInput,
          stageExecution.result,
          stageDescriptor,
          stageExecution.labelDescriptor
        );
        await this.runtime.runInlineEffects(command, normalized, subEnv);
        return { normalized, labels: stageExecution.labelDescriptor };
      } catch (error) {
        const message = formatParallelStageError(error);
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
        this.runtime.logStructuredStage('output', command.rawIdentifier, stageIndex, normalized, true);
        return { normalized };
      }
    };

    return await this.runtime.env.withPipeContext(pipelineSnapshot, async () => {
      if (branchContextManager) {
        return await branchContextManager.withOperation(branchOperationContext, runBranch);
      }
      return await runBranch();
    });
  }

  private async executeBranchCommand(
    command: PipelineStageEntry,
    input: string,
    branchInput: StructuredValue,
    subEnv: Environment,
    branchOperationContext: OperationContext,
    branchHookNode: ExecInvocation,
    stageIndex: number,
    context: StageContext,
    parallelIndex: number
  ): Promise<StageExecutionResult> {
    if ((command as InlineValueStage).type === 'inlineValue') {
      return await this.runtime.inlineStageExecutor.executeInlineValueStage(command as InlineValueStage, branchInput, subEnv);
    }
    if ((command as InlineCommandStage).type === 'inlineCommand') {
      return await this.runtime.inlineStageExecutor.executeInlineCommandStage({
        stage: command as InlineCommandStage,
        structuredInput: branchInput,
        stageEnv: subEnv,
        operationContext: branchOperationContext,
        stageIndex,
        stageContext: context,
        contextFactory: this.runtime,
        parallelIndex
      });
    }
    return await this.runtime.executeCommand(
      command as PipelineCommand,
      input,
      branchInput,
      subEnv,
      branchOperationContext,
      branchHookNode,
      stageIndex,
      context,
      parallelIndex
    );
  }

  private collectBranchErrorMarkers(
    branchPayloads: ParallelBranchResult[],
    errors: ParallelStageError[]
  ): void {
    if (errors.length > 0) {
      return;
    }

    for (let i = 0; i < branchPayloads.length; i += 1) {
      const candidate = extractStageValue(branchPayloads[i].normalized);
      if (!(candidate && typeof candidate === 'object' && 'message' in candidate && 'error' in candidate)) {
        continue;
      }
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
