import { MeldError, ErrorSeverity, BaseErrorDetails, ErrorSourceLocation } from './MeldError.js';
import { PathErrorMessages } from '@core/errors/messages/index.js';

/**
 * Represents details specific to file not found errors.
 */
export interface MeldFileNotFoundErrorDetails extends BaseErrorDetails {
  filePath: string; // The path that was not found
  operation?: string; // e.g., 'read', 'write', 'import'
}

export interface MeldFileNotFoundErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Error thrown when a required file cannot be found.
 */
export class MeldFileNotFoundError extends MeldError {
  constructor(
    message: string,
    options: {
      details: MeldFileNotFoundErrorDetails;
      severity?: ErrorSeverity;
      sourceLocation?: ErrorSourceLocation;
      cause?: unknown; // Often wraps a system error like ENOENT
    }
  ) {
    super(message, {
      code: 'E_FILE_NOT_FOUND', // Standard error code
      severity: options.severity || ErrorSeverity.Fatal, // Usually fatal if the file is required
      details: options.details,
      sourceLocation: options.sourceLocation,
      cause: options.cause,
    });
  }
} 