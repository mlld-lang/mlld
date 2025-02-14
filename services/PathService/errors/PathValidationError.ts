import { PathOptions } from '../IPathService';

/**
 * Error codes for path validation failures
 */
export enum PathErrorCode {
  INVALID_PATH = 'INVALID_PATH',
  NULL_BYTE = 'NULL_BYTE',
  OUTSIDE_BASE_DIR = 'OUTSIDE_BASE_DIR',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  NOT_A_FILE = 'NOT_A_FILE',
  NOT_A_DIRECTORY = 'NOT_A_DIRECTORY'
}

/**
 * Error thrown when path validation fails
 */
export class PathValidationError extends Error {
  constructor(
    message: string,
    public readonly code: PathErrorCode,
    public readonly details?: {
      filePath?: string;
      options?: PathOptions;
      cause?: Error;
    }
  ) {
    super(`Path validation error (${code}): ${message}`);
    this.name = 'PathValidationError';
  }
} 