import { MeldError, ErrorSeverity } from './MeldError.js';

export interface MeldFileNotFoundErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

export class MeldFileNotFoundError extends MeldError {
  constructor(
    filePath: string, 
    options: MeldFileNotFoundErrorOptions = {}
  ) {
    // File not found errors are typically recoverable by default
    const severity = options.severity || ErrorSeverity.Recoverable;
    
    super(`File not found: ${filePath}`, {
      code: 'FILE_NOT_FOUND',
      filePath,
      cause: options.cause,
      severity,
      context: {
        ...options.context,
        filePath
      }
    });
    
    this.name = 'MeldFileNotFoundError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldFileNotFoundError.prototype);
  }
} 