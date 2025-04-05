import { MeldError, ErrorSeverity, BaseErrorDetails, ErrorSourceLocation } from './MeldError.js';
import type { PathValidationContext } from '@core/types/paths.js';

export enum PathErrorCode {
  INVALID_PATH = 'INVALID_PATH',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  NOT_A_FILE = 'NOT_A_FILE',
  NOT_A_DIRECTORY = 'NOT_A_DIRECTORY',
  OUTSIDE_BASE_DIR = 'OUTSIDE_BASE_DIR',
  INVALID_VARIABLE = 'INVALID_VARIABLE',
  NULL_BYTE = 'NULL_BYTE',
  INVALID_CHARS = 'INVALID_CHARS'
}

export interface PathValidationErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Represents details specific to path validation errors.
 */
export interface PathValidationErrorDetails extends BaseErrorDetails {
  pathString: string; // The original path string that failed validation
  validationContext?: Partial<PathValidationContext>;
  ruleFailed?: string; // e.g., 'allowAbsolute', 'maxLength', 'pattern', 'mustExist'
  reason?: string; // More specific reason, e.g., "Path traversal detected"
}

/**
 * Error thrown when path validation fails according to specified rules.
 */
export class PathValidationError extends MeldError {
  constructor(
    message: string,
    options: {
      code: string; // e.g., E_PATH_INVALID, E_PATH_FORBIDDEN, E_PATH_NOT_FOUND
      details: PathValidationErrorDetails;
      severity?: ErrorSeverity;
      sourceLocation?: ErrorSourceLocation;
      cause?: unknown;
    }
  ) {
    super(message, {
      code: options.code,
      severity: options.severity || ErrorSeverity.Fatal, // Path errors are often fatal
      details: options.details,
      sourceLocation: options.sourceLocation,
      cause: options.cause,
    });
  }
} 