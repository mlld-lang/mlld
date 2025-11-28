import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import type { SourceLocation } from '@core/types';

export interface CircularReferenceErrorContext {
  identifier?: string;
  filePath?: string;
  location?: SourceLocation;
}

/**
 * Error thrown when a circular reference is detected in executable resolution
 */
export class CircularReferenceError extends MlldError {
  public readonly identifier?: string;
  public readonly location?: SourceLocation;

  constructor(
    message: string,
    context?: CircularReferenceErrorContext
  ) {
    const locationStr = context?.location
      ? ` at line ${context.location.line}, column ${context.location.column}${context.location.filePath ? ` in ${context.location.filePath}` : ''}`
      : context?.filePath ? ` in ${context.filePath}` : '';

    super(`${message}${locationStr}`, {
      code: 'CIRCULAR_REFERENCE',
      severity: ErrorSeverity.Fatal,
      sourceLocation: context?.location,
      details: {
        identifier: context?.identifier,
        filePath: context?.location?.filePath || context?.filePath
      }
    });

    this.name = 'CircularReferenceError';
    this.identifier = context?.identifier;
    this.location = context?.location;

    Object.setPrototypeOf(this, CircularReferenceError.prototype);
  }
}
