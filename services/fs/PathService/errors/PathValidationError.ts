import { PathOptions } from '@services/fs/PathService/IPathService.js';
import type { Location } from '@core/types/index.js';

/**
 * Error codes for path validation failures
 */
export enum PathErrorCode {
  // Basic validation
  E_PATH_EMPTY = 'E_PATH_EMPTY',
  E_PATH_NULL_BYTE = 'E_PATH_NULL_BYTE',
  E_FILE_NOT_FOUND = 'E_FILE_NOT_FOUND',
  E_PATH_NOT_FOUND = 'E_PATH_NOT_FOUND',
  E_PATH_INVALID = 'E_PATH_INVALID',
  E_INTERNAL = 'E_INTERNAL',
  
  // File type validation
  E_PATH_NOT_A_FILE = 'E_PATH_NOT_A_FILE',
  E_PATH_NOT_A_DIRECTORY = 'E_PATH_NOT_A_DIRECTORY',

  // Meld-specific path rules
  E_PATH_CONTAINS_DOT_SEGMENTS = 'E_PATH_CONTAINS_DOT_SEGMENTS',     // Path contains . or .. segments
  E_PATH_INVALID_FORMAT = 'E_PATH_INVALID_FORMAT',         // Path with slashes doesn't use $. or $~
  E_PATH_RAW_ABSOLUTE = 'E_PATH_RAW_ABSOLUTE',            // Path is absolute but doesn't use $. or $~
  E_PATH_OUTSIDE_ROOT = 'E_PATH_OUTSIDE_ROOT',            // Path is outside allowed root directories
  E_PATH_EXPECTED_FS = 'E_PATH_EXPECTED_FS',               // Expected filesystem path but got URL
  E_PATH_EXPECTED_URL = 'E_PATH_EXPECTED_URL',

  // URL Specific Errors
  E_URL_PROTOCOL_NOT_ALLOWED = 'E_URL_PROTOCOL_NOT_ALLOWED',
  E_URL_VALIDATION_FAILED = 'E_URL_VALIDATION_FAILED',
  E_URL_FETCH_FAILED = 'E_URL_FETCH_FAILED'
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