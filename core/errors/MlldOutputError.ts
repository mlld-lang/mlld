import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';

export interface MlldOutputErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
  sourceLocation?: SourceLocation;
  env?: Environment;
}

/**
 * Error thrown when output generation fails
 */
export class MlldOutputError extends MlldError {
  public readonly format: string;

  constructor(
    message: string,
    format: string,
    options: MlldOutputErrorOptions = {}
  ) {
    // Output errors are typically recoverable by default
    const severity = options.severity || ErrorSeverity.Recoverable;
    
    super(`Output error (${format}): ${message}`, {
      code: 'OUTPUT_GENERATION_FAILED',
      cause: options.cause,
      severity,
      sourceLocation: options.sourceLocation,
      env: options.env,
      details: {
        ...options.context,
        format
      }
    });
    
    this.name = 'MlldOutputError';
    this.format = format;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MlldOutputError.prototype);
  }
} 
