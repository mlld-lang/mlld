import { MeldError } from './MeldError';

/**
 * Error thrown when evaluating complex data values fails.
 * This can happen when embedded directives, variable references, or templates
 * within @data directives fail to evaluate.
 */
export class DataEvaluationError extends MeldError {
  constructor(
    public dataPath: string,
    public originalError: Error
  ) {
    super(
      `Failed to evaluate data at ${dataPath}: ${originalError.message}`,
      'DATA_EVALUATION_ERROR',
      undefined
    );
    this.name = 'DataEvaluationError';
  }
}