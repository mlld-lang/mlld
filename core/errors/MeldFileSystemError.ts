import { MeldError, type MeldErrorOptions, ErrorSeverity } from './MeldError.js';

export interface MeldFileSystemErrorOptions extends MeldErrorOptions {
  command?: string;
  cwd?: string;
  severity?: ErrorSeverity;
}

/**
 * Error thrown when file system operations fail
 */
export class MeldFileSystemError extends MeldError {
  public readonly command?: string;
  public readonly cwd?: string;

  constructor(message: string, options: MeldFileSystemErrorOptions = {}) {
    // File system errors are typically fatal by default
    const severity = options.severity || ErrorSeverity.Fatal;
    
    super(message, {
      ...options,
      severity,
      code: options.code || 'FILE_SYSTEM_ERROR'
    });
    
    this.name = 'MeldFileSystemError';
    this.command = options.command;
    this.cwd = options.cwd;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldFileSystemError.prototype);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      command: this.command,
      cwd: this.cwd
    };
  }
} 