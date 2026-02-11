import type { PipelineStage, PipelineStageEntry } from '@core/types';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import type { Environment } from '@interpreter/env/Environment';
import type { StageResult } from '@interpreter/eval/pipeline/state-machine';
import { MlldCommandExecutionError } from '@core/errors';
import type { StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import { cloneStructuredValue, safeJSONStringify } from './helpers';
import type { ExecuteOptions } from './types';

type StreamEventInput = Omit<StreamEvent, 'timestamp' | 'pipelineId'> & {
  timestamp?: number;
  pipelineId?: string;
};

export interface PipelineExecutionLoopRuntime {
  env: Environment;
  pipeline: PipelineStage[];
  stateMachine: {
    transition(action: any): any;
    getAllRetryHistory(): Map<string, StructuredValue[]>;
  };
  stageOutputs: {
    initialize(initialOutput: StructuredValue): void;
    getInitialOutput(): StructuredValue | undefined;
    clearFrom(stage: number): void;
    getFinal(): StructuredValue;
  };
  outputProcessor: {
    applySourceDescriptor(target: StructuredValue, original: unknown): void;
  };
  hasSyntheticSource: boolean;
  isRetryable: boolean;
  setInitialInputText(value: string): void;
  setAllRetryHistory(history: Map<string, StructuredValue[]>): void;
  executeSingleStage(
    stageIndex: number,
    command: PipelineStageEntry,
    input: string,
    context: any
  ): Promise<StageResult>;
  executeParallelStage(
    stageIndex: number,
    commands: PipelineStageEntry[],
    input: string,
    context: any
  ): Promise<StageResult>;
  emitStream(event: StreamEventInput): void;
}

export class PipelineExecutionLoopRunner {
  constructor(private readonly runtime: PipelineExecutionLoopRuntime) {}

  async execute(initialInput: string | StructuredValue, options?: ExecuteOptions): Promise<string | StructuredValue> {
    this.runtime.env.resetPipelineGuardHistory();

    const initialWrapper = isStructuredValue(initialInput)
      ? cloneStructuredValue(initialInput)
      : wrapStructured(
          initialInput,
          'text',
          typeof initialInput === 'string' ? initialInput : safeJSONStringify(initialInput)
        );
    this.runtime.outputProcessor.applySourceDescriptor(initialWrapper, initialInput);
    this.runtime.setInitialInputText(initialWrapper.text);
    this.runtime.stageOutputs.initialize(initialWrapper);
    const initialStructured = this.runtime.stageOutputs.getInitialOutput();

    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Pipeline start:', {
        stages: this.runtime.pipeline.map(stage => Array.isArray(stage) ? '[parallel]' : stage.rawIdentifier),
        hasSyntheticSource: this.runtime.hasSyntheticSource,
        isRetryable: this.runtime.isRetryable
      });
    }
    this.runtime.emitStream({ type: 'PIPELINE_START', source: 'pipeline' });

    let nextStep = this.runtime.stateMachine.transition({
      type: 'START',
      input: initialWrapper.text,
      structuredInput: initialStructured ? cloneStructuredValue(initialStructured) : undefined
    });
    let iteration = 0;

    while (nextStep.type === 'EXECUTE_STAGE') {
      iteration += 1;

      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[PipelineExecutor] Iteration ${iteration}:`, {
          stage: nextStep.stage,
          stageId: this.runtime.pipeline[nextStep.stage]?.rawIdentifier,
          contextAttempt: nextStep.context.contextAttempt
        });
      }

      this.runtime.stageOutputs.clearFrom(nextStep.stage);

      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Execute stage:', {
          stage: nextStep.stage,
          contextId: nextStep.context.contextId,
          contextAttempt: nextStep.context.contextAttempt,
          inputLength: nextStep.input?.length,
          commandId: this.runtime.pipeline[nextStep.stage]?.rawIdentifier
        });
      }
      this.runtime.emitStream({
        type: 'STAGE_START',
        stageIndex: nextStep.stage,
        command: this.runtime.pipeline[nextStep.stage],
        contextId: nextStep.context.contextId,
        attempt: nextStep.context.contextAttempt
      });
      const stageStartTime = Date.now();

      const stageEntry = this.runtime.pipeline[nextStep.stage];
      const stageResult = Array.isArray(stageEntry)
        ? await this.runtime.executeParallelStage(nextStep.stage, stageEntry, nextStep.input, nextStep.context)
        : await this.runtime.executeSingleStage(nextStep.stage, stageEntry, nextStep.input, nextStep.context);

      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage result:', {
          resultType: stageResult.type,
          isRetry: stageResult.type === 'retry'
        });
      }
      if (stageResult.type === 'success') {
        this.runtime.emitStream({
          type: 'STAGE_SUCCESS',
          stageIndex: nextStep.stage,
          durationMs: Date.now() - stageStartTime
        });
      } else if (stageResult.type === 'error') {
        this.runtime.emitStream({
          type: 'STAGE_FAILURE',
          stageIndex: nextStep.stage,
          error: stageResult.error
        });
      }

      nextStep = this.runtime.stateMachine.transition({
        type: 'STAGE_RESULT',
        result: stageResult
      });
      this.runtime.setAllRetryHistory(this.runtime.stateMachine.getAllRetryHistory());

      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Next step:', {
          type: nextStep.type,
          nextStage: nextStep.type === 'EXECUTE_STAGE' ? nextStep.stage : undefined
        });
      }

      if (iteration > 100) {
        throw new Error('Pipeline exceeded 100 iterations');
      }
    }

    return this.handleFinalStep(nextStep, options);
  }

  private handleFinalStep(nextStep: any, options?: ExecuteOptions): string | StructuredValue {
    switch (nextStep.type) {
      case 'COMPLETE':
        this.runtime.emitStream({ type: 'PIPELINE_COMPLETE' });
        if (options?.returnStructured) {
          return this.runtime.stageOutputs.getFinal();
        }
        return nextStep.output;

      case 'ERROR':
        this.runtime.emitStream({ type: 'PIPELINE_ABORT', reason: nextStep.error.message });
        throw new MlldCommandExecutionError(
          `Pipeline failed at stage ${nextStep.stage + 1}: ${nextStep.error.message}`,
          undefined,
          {
            command: (this.runtime.pipeline[nextStep.stage] as any)?.rawIdentifier || 'unknown',
            exitCode: 1,
            duration: 0,
            workingDirectory: this.runtime.env.getExecutionDirectory()
          }
        );

      case 'ABORT':
        this.runtime.emitStream({ type: 'PIPELINE_ABORT', reason: nextStep.reason || 'aborted' });
        throw new MlldCommandExecutionError(
          `Pipeline aborted: ${nextStep.reason}`,
          undefined,
          {
            command: 'pipeline',
            exitCode: 1,
            duration: 0,
            workingDirectory: this.runtime.env.getExecutionDirectory()
          }
        );

      default:
        throw new Error('Pipeline ended in unexpected state');
    }
  }
}
