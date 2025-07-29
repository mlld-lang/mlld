/**
 * Error thrown when evaluating when expressions
 */

import { MlldError } from './MlldError';
import type { SourceLocation } from '../types';

export interface WhenExpressionErrorDetails {
  conditionIndex?: number;
  phase?: 'condition' | 'action';
  originalError?: Error;
  errors?: Error[];
}

export class MlldWhenExpressionError extends MlldError {
  public readonly details?: WhenExpressionErrorDetails;

  constructor(
    message: string,
    location?: SourceLocation,
    details?: WhenExpressionErrorDetails
  ) {
    super(message, 'E_WHEN_EXPRESSION', location);
    this.details = details;
    this.name = 'MlldWhenExpressionError';
  }
}