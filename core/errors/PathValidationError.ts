import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';

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

export class PathValidationError extends MeldError {
  public readonly path: string;
  public readonly code: PathErrorCode;

  constructor(
    message: string,
    path: string,
    code: PathErrorCode,
    options: PathValidationErrorOptions = {}
  ) {
    // Path validation errors are typically fatal by default
    const severity = options.severity || ErrorSeverity.Fatal;
    
    super(`Path validation error: ${message} (path: ${path})`, {
      code,
      severity,
      cause: options.cause,
      context: {
        ...options.context,
        path
      }
    });
    
    this.name = 'PathValidationError';
    this.path = path;
    this.code = code;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PathValidationError.prototype);
  }
} 