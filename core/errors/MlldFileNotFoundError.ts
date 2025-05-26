import { MlldError, ErrorSeverity, BaseErrorDetails, ErrorSourceLocation } from './MlldError';
import { PathErrorMessages } from '@core/errors/messages/index';

/**
 * Represents details specific to file not found errors.
 */
export interface MlldFileNotFoundErrorDetails extends BaseErrorDetails {
  filePath: string; // The path that was not found
  operation?: string; // e.g., 'read', 'write', 'import'
}

export interface MlldFileNotFoundErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Error thrown when a required file cannot be found.
 */
export class MlldFileNotFoundError extends MlldError {
  constructor(
    message: string,
    options: {
      details: MlldFileNotFoundErrorDetails;
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