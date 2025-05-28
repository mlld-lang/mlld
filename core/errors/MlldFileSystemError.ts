import { MlldError, type MlldErrorOptions, ErrorSeverity, type BaseErrorDetails, type ErrorSourceLocation } from '@core/errors/MlldError';
import { formatLocationForError } from '@core/utils/locationFormatter';

// Define options specific to FileSystemError, without extending MlldErrorOptions
export interface MlldFileSystemErrorOptions { 
  command?: string;
  cwd?: string;
  // Include optional properties handled by MlldError constructor logic
  severity?: ErrorSeverity; 
  code?: string; 
  details?: BaseErrorDetails;
  sourceLocation?: ErrorSourceLocation;
  cause?: unknown;
}

/**
 * Error thrown when file system operations fail
 */
export class MlldFileSystemError extends MlldError {
  public readonly command?: string;
  public readonly cwd?: string;
  public readonly cause?: unknown;

  constructor(message: string, options: MlldFileSystemErrorOptions = {}) {
    // File system errors are typically fatal by default
    const severity = options.severity || ErrorSeverity.Fatal;
    const code = options.code || 'FILE_SYSTEM_ERROR';
    
    super(message, {
      severity: severity,
      code: code,
      details: options.details,
      sourceLocation: options.sourceLocation,
      cause: options.cause
    });
    
    this.name = 'MlldFileSystemError';
    this.command = options.command;
    this.cwd = options.cwd;
    this.cause = options.cause;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MlldFileSystemError.prototype);
  }

  toJSON() {
    const cause = this.cause;
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      command: this.command,
      cwd: this.cwd,
      filePath: this.details?.filePath,
      cause: cause instanceof Error ? cause.message : String(cause),
      details: this.details,
      sourceLocation: this.sourceLocation ? formatLocationForError(this.sourceLocation) : undefined
    };
  }
} 