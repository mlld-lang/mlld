import { PathOptions } from '../IPathService.js';
import type { Location } from '@core/types/index.js';

/**
 * Error codes for path validation failures
 */
export enum PathErrorCode {
  // Basic validation
  INVALID_PATH = 'INVALID_PATH',
  EMPTY_PATH = 'EMPTY_PATH',
  NULL_BYTE = 'NULL_BYTE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  
  // File type validation
  NOT_A_FILE = 'NOT_A_FILE',
  NOT_A_DIRECTORY = 'NOT_A_DIRECTORY',

  // Meld-specific path rules
  CONTAINS_DOT_SEGMENTS = 'CONTAINS_DOT_SEGMENTS',     // Path contains . or .. segments
  INVALID_PATH_FORMAT = 'INVALID_PATH_FORMAT',         // Path with slashes doesn't use $. or $~
  RAW_ABSOLUTE_PATH = 'RAW_ABSOLUTE_PATH',            // Path is absolute but doesn't use $. or $~
  OUTSIDE_BASE_DIR = 'OUTSIDE_BASE_DIR'
}

/**
 * Error details for path validation errors
 */
export interface PathValidationErrorDetails {
  code: PathErrorCode;
  path: string;
  resolvedPath?: string;
  baseDir?: string;
  cause?: Error;
}

/**
 * Error thrown when path validation fails
 */
export class PathValidationError extends Error {
  public code: PathErrorCode;
  public path: string;
  public resolvedPath?: string;
  public baseDir?: string;
  public cause?: Error;
  public location?: Location;

  constructor(
    message: string,
    details: PathValidationErrorDetails,
    location?: Location
  ) {
    super(message);
    this.name = 'PathValidationError';
    this.code = details.code;
    this.path = details.path;
    this.resolvedPath = details.resolvedPath;
    this.baseDir = details.baseDir;
    this.cause = details.cause;
    this.location = location;
  }
} 