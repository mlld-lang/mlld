import { MeldError, type MeldErrorOptions, ErrorSeverity, type BaseErrorDetails, type ErrorSourceLocation } from '@core/errors/MeldError';

// Define options specific to FileSystemError, without extending MeldErrorOptions
export interface MeldFileSystemErrorOptions { 
  command?: string;
  cwd?: string;
  // Include optional properties handled by MeldError constructor logic
  severity?: ErrorSeverity; 
  code?: string; 
  details?: BaseErrorDetails;
  sourceLocation?: ErrorSourceLocation;
  cause?: unknown;
}

/**
 * Error thrown when file system operations fail
 */
export class MeldFileSystemError extends MeldError {
  public readonly command?: string;
  public readonly cwd?: string;
  public readonly cause?: unknown;

  constructor(message: string, options: MeldFileSystemErrorOptions = {}) {
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
    
    this.name = 'MeldFileSystemError';
    this.command = options.command;
    this.cwd = options.cwd;
    this.cause = options.cause;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldFileSystemError.prototype);
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
      sourceLocation: this.sourceLocation
    };
  }
} 