import { PathOptions } from '@services/PathService/IPathService.js';
import type { Location } from '@core/types.js';

/**
 * Error codes for path validation failures
 */
export enum PathErrorCode {
  INVALID_PATH = 'INVALID_PATH',
  NULL_BYTE = 'NULL_BYTE',
  OUTSIDE_BASE_DIR = 'OUTSIDE_BASE_DIR',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  NOT_A_FILE = 'NOT_A_FILE',
  NOT_A_DIRECTORY = 'NOT_A_DIRECTORY'
}

/**
 * Error thrown when path validation fails
 */
export class PathValidationError extends Error {
  public readonly code: PathErrorCode;
  public readonly location?: Location;

  constructor(message: string, code: PathErrorCode, location?: Location) {
    const locationStr = location ? 
      ` at line ${location.start.line}, column ${location.start.column}` +
      (location.filePath ? ` in ${location.filePath}` : '')
      : '';
    
    super(`Path validation error: ${message}${locationStr}`);
    this.name = 'PathValidationError';
    this.code = code;
    this.location = location;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PathValidationError.prototype);
  }
} 