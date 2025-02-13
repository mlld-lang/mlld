export class MeldOutputError extends Error {
  constructor(
    message: string,
    public readonly format: string,
    public readonly cause?: Error
  ) {
    super(`Output error (${format}): ${message}${cause ? ` - ${cause.message}` : ''}`);
    
    this.name = 'MeldOutputError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldOutputError.prototype);
  }
} 