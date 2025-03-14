import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { PathErrorMessages } from '@core/errors/messages/index.js';

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
    
    // Format the message using the centralized error message template
    const message = PathErrorMessages.fileAccess.fileNotFound.message.replace('{filePath}', filePath);
    
    super(message, {
      code: PathErrorMessages.fileAccess.fileNotFound.code,
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