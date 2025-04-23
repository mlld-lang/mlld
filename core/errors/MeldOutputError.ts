import { MeldError, ErrorSeverity } from '@core/errors/MeldError';

export interface MeldOutputErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Error thrown when output generation fails
 */
export class MeldOutputError extends MeldError {
  public readonly format: string;

  constructor(
    message: string,
    format: string,
    options: MeldOutputErrorOptions = {}
  ) {
    // Output errors are typically recoverable by default
    const severity = options.severity || ErrorSeverity.Recoverable;
    
    super(`Output error (${format}): ${message}`, {
      code: 'OUTPUT_GENERATION_FAILED',
      cause: options.cause,
      severity,
      details: {
        ...options.context,
        format
      }
    });
    
    this.name = 'MeldOutputError';
    this.format = format;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldOutputError.prototype);
  }
} 