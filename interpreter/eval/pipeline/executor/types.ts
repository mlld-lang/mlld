import type { SecurityDescriptor } from '@core/types/security';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import type { CommandExecutionContext } from '@interpreter/env/ErrorUtils';
import type { StageContext } from '@interpreter/eval/pipeline/state-machine';

export interface RetrySignal {
  value: 'retry';
  hint?: any;
  from?: number;
}

export interface StageExecutionResult {
  result: StructuredValue | string | RetrySignal;
  labelDescriptor?: SecurityDescriptor;
}

export interface ParallelStageError {
  index: number;
  key?: string | number | null;
  message: string;
  error: string;
  value?: unknown;
}

export interface PipelineCommandExecutionContextFactory {
  createCommandExecutionContext(
    stageIndex: number,
    stageContext: StageContext,
    parallelIndex?: number,
    directiveType?: string,
    workingDirectory?: string
  ): CommandExecutionContext;
}

export interface ExecuteOptions {
  returnStructured?: boolean;
  stream?: boolean;
}
