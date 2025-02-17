export interface MeldErrorOptions {
  cause?: Error;
  code?: string;
  filePath?: string;
}

interface SerializedMeldError {
  name: string;
  message: string;
  code?: string;
  filePath?: string;
  cause?: string;
}

/**
 * Base class for all Meld errors
 */
export class MeldError extends Error {
  public readonly code?: string;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(message: string, options: MeldErrorOptions = {}) {
    super(message);
    this.name = 'MeldError';
    this.code = options.code;
    this.errorCause = options.cause;
    this.filePath = options.filePath;

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
      cause: this.errorCause?.message
    };
  }

  /**
   * Wrap an unknown error in a MeldError
   */
  public static wrap(error: unknown, message?: string): MeldError {
    if (error instanceof MeldError) {
      return error;
    }
    
    return new MeldError(
      message || (error instanceof Error ? error.message : String(error)),
      { cause: error instanceof Error ? error : undefined }
    );
  }
} 