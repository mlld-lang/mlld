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
  public readonly details: {
    exitCode?: number;
    stderr?: string;
    stdout?: string;
    command?: string;
    conditionIndex?: number;
    modifier?: 'first' | 'all' | 'any';
    originalError?: Error;
    errors?: ErrorSummary[];
  };

  constructor(
    message: string,
    modifier?: 'first' | 'all' | 'any',
    location?: { line: number; column: number; filePath?: string },
    details: {
      exitCode?: number;
      stderr?: string;
      stdout?: string;
      command?: string;
      conditionIndex?: number;
      originalError?: Error;
      errors?: ErrorSummary[];
    } = {}
  ) {
    super(message, 'when', {
      location,
      code: 'CONDITION_ERROR',
      context: { modifier, ...details }
    });
    
    this.details = { ...details, modifier };
    this.name = 'MlldConditionError';
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, MlldConditionError.prototype);
  }
}