import { MlldError, ErrorSeverity } from '@core/errors/MlldError';

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

export interface MlldImportErrorOptions {
  code?: string;
  details?: ImportErrorDetails;
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Error thrown when import operations fail
 */
export class MlldImportError extends MlldError {
  public readonly details?: ImportErrorDetails;

  constructor(
    message: string,
    options: MlldImportErrorOptions = {}
  ) {
    const importChainStr = options.details?.importChain 
      ? ` (chain: ${options.details.importChain.join(' → ')})`
      : '';
    
    // Circular imports are fatal, other import errors are typically recoverable
    const isCyclic = options.code === 'CIRCULAR_IMPORT' || message.includes('circular');
    const severity = options.severity || (isCyclic ? ErrorSeverity.Fatal : ErrorSeverity.Recoverable);
    
    super(`Import error${options.code ? ` (${options.code})` : ''}: ${message}${importChainStr}`, {
      code: options.code || 'IMPORT_FAILED',
      cause: options.cause || options.details?.cause,
      severity,
      details: {
        ...options.context,
        filePath: options.details?.filePath,
        importChain: options.details?.importChain,
        variableName: options.details?.variableName
      }
    });
    
    this.name = 'MlldImportError';
    this.details = options.details;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MlldImportError.prototype);
  }
} 