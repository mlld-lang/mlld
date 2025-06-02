import { MlldDirectiveError } from './MlldDirectiveError';

export interface ErrorSummary {
  type: string;
  count: number;
  firstExample: {
    conditionIndex: number;
    message: string;
    details?: any;
  };
}

export class MlldConditionError extends MlldDirectiveError {
  constructor(
    message: string,
    public details: {
      exitCode?: number;
      stderr?: string;
      stdout?: string;
      command?: string;
      conditionIndex?: number;
      modifier?: 'first' | 'all' | 'any';
      originalError?: Error;
      errors?: ErrorSummary[];
    } = {}
  ) {
    super('when', message);
  }
}