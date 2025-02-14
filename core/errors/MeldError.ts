export interface MeldErrorOptions {
  cause?: Error;
  code?: string;
}

export class MeldError extends Error {
  public readonly code?: string;
  public readonly cause?: Error;

  constructor(message: string, options: MeldErrorOptions = {}) {
    super(message);
    this.name = 'MeldError';
    this.code = options.code;
    this.cause = options.cause;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

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