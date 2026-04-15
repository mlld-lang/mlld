import { MlldDirectiveError } from './MlldDirectiveError';
import type { ErrorSnapshot } from './errorSerialization';

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
    modifier?: 'all' | 'any';
    originalError?: ErrorSnapshot | unknown;
    errors?: ErrorSummary[];
  };

  constructor(
    message: string,
    modifier?: 'all' | 'any',
    location?: { line: number; column: number; filePath?: string },
    details: {
      exitCode?: number;
      stderr?: string;
      stdout?: string;
      command?: string;
      conditionIndex?: number;
      originalError?: ErrorSnapshot | unknown;
      errors?: ErrorSummary[];
    } = {},
    cause?: unknown
  ) {
    super(message, 'when', {
      location,
      code: 'CONDITION_ERROR',
      context: { modifier, ...details },
      cause: cause instanceof Error ? cause : undefined
    });
    
    this.details = { ...details, modifier };
    this.name = 'MlldConditionError';
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, MlldConditionError.prototype);
  }
}
