import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';

export interface ImportErrorDetails {
  importChain?: string[];
  filePath?: string;
  cause?: Error;
  variableName?: string;
  // Additional fields for enhanced circular import detection
  maxDepth?: number;
  fileName?: string;
  count?: number;
}

export interface MeldImportErrorOptions {
  code?: string;
  details?: ImportErrorDetails;
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Error thrown when import operations fail
 */
export class MeldImportError extends MeldError {
  public readonly details?: ImportErrorDetails;

  constructor(
    message: string,
    options: MeldImportErrorOptions = {}
  ) {
    const importChainStr = options.details?.importChain 
      ? ` (chain: ${options.details.importChain.join(' → ')})`
      : '';
    
    // Circular imports are fatal, other import errors are typically recoverable
    const isCyclic = options.code === 'CIRCULAR_IMPORT' || message.includes('circular');
    const severity = options.severity || (isCyclic ? ErrorSeverity.Fatal : ErrorSeverity.Recoverable);
    
    super(`Import error${options.code ? ` (${options.code})` : ''}: ${message}${importChainStr}`, {
      code: options.code || 'IMPORT_FAILED',
      filePath: options.details?.filePath,
      cause: options.cause || options.details?.cause,
      severity,
      context: {
        ...options.context,
        importChain: options.details?.importChain,
        variableName: options.details?.variableName
      }
    });
    
    this.name = 'MeldImportError';
    this.details = options.details;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldImportError.prototype);
  }
} 