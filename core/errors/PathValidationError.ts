export class PathValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly code: PathErrorCode
  ) {
    super(`Path validation error: ${message} (path: ${path})`);
    this.name = 'PathValidationError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PathValidationError.prototype);
  }
}

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