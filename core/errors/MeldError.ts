export enum ErrorSeverity {
  // Must halt execution
  Fatal = 'fatal',    
  // Can be converted to warning in permissive mode
  Recoverable = 'recoverable',  
  // Always just a warning
  Warning = 'warning'   
}

export interface MeldErrorOptions {
  cause?: Error;
  code?: string;
  filePath?: string;
  severity?: ErrorSeverity;
  context?: any;
}

interface SerializedMeldError {
  name: string;
  message: string;
  code?: string;
  filePath?: string;
  cause?: string;
  severity: ErrorSeverity;
  context?: any;
}

/**
 * Base class for all Meld errors
 */
export class MeldError extends Error {
  public readonly code?: string;
  public readonly filePath?: string;
  private readonly errorCause?: Error;
  public readonly severity: ErrorSeverity;
  public readonly context?: any;

  constructor(message: string, options: MeldErrorOptions = {}) {
    super(message);
    this.name = 'MeldError';
    this.code = options.code;
    this.errorCause = options.cause;
    this.filePath = options.filePath;
    this.severity = options.severity || ErrorSeverity.Fatal;
    this.context = options.context;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedMeldError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      filePath: this.filePath,
      cause: this.errorCause?.message,
      severity: this.severity,
      context: this.context
    };
  }

  /**
   * Check if this error can be treated as a warning in permissive mode
   */
  canBeWarning(): boolean {
    return this.severity === ErrorSeverity.Recoverable 
        || this.severity === ErrorSeverity.Warning;
  }

  /**
   * Wrap an unknown error in a MeldError
   */
  public static wrap(error: unknown, message?: string, severity: ErrorSeverity = ErrorSeverity.Fatal): MeldError {
    if (error instanceof MeldError) {
      return error;
    }
    
    return new MeldError(
      message || (error instanceof Error ? error.message : String(error)),
      { 
        cause: error instanceof Error ? error : undefined,
        severity
      }
    );
  }
} 