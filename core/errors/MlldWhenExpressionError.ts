/**
 * Error thrown when evaluating when expressions
 */

import { ErrorSeverity, MlldError } from './MlldError';
import type { SourceLocation } from '../types';
import type { Environment } from '@interpreter/env/Environment';

export interface WhenExpressionErrorDetails {
  conditionIndex?: number;
  phase?: 'condition' | 'action';
  originalError?: Error;
  errors?: string[];
  conditionErrors?: string;
  conditionText?: string;
  conditionLocation?: SourceLocation;
  type?: string;
  filePath?: string;
  sourceContent?: string;
}

export class MlldWhenExpressionError extends MlldError {
  public readonly details?: WhenExpressionErrorDetails;

  constructor(
    message: string,
    location?: SourceLocation,
    details?: WhenExpressionErrorDetails,
    options?: {
      env?: Environment;
      severity?: ErrorSeverity;
    }
  ) {
    const locationStr = location
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    super(`${message}${locationStr}`, {
      code: 'E_WHEN_EXPRESSION',
      severity: options?.severity ?? ErrorSeverity.Recoverable,
      details,
      sourceLocation: location,
      env: options?.env
    });
    this.details = details;
    this.name = 'MlldWhenExpressionError';
  }
}
