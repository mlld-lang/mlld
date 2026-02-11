import type { SecurityDescriptor } from '@core/types/security';
import type { StructuredValue } from '@interpreter/utils/structured-value';

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
