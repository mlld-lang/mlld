import type { Location, Position } from '@core/types/index.js';

interface SerializedParseError {
  name: string;
  message: string;
  location?: Location;
  filePath?: string;
  cause?: string;
}

/**
 * Error thrown when parsing Meld content fails
 */
export class MeldParseError extends Error {
  /**
   * Location information for where the error occurred
   */
  public readonly location?: Location;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(
    message: string, 
    position?: Position | Location,
    cause?: Error
  ) {
    // Format message with location if available
    const locationStr = position ? 
      ` at line ${('line' in position ? position.line : position.start.line)}, ` +
      `column ${('column' in position ? position.column : position.start.column)}` +
      (('filePath' in position && position.filePath) ? ` in ${position.filePath}` : '')
      : '';
    
    super(`Parse error: ${message}${locationStr}`);
    this.name = 'MeldParseError';
    this.errorCause = cause;

    // Convert Position to Location if needed
    if (position) {
      if ('line' in position) {
        // It's a Position
        this.location = {
          start: position,
          end: position,
          filePath: undefined
        };
      } else {
        // It's already a Location
        this.location = position;
      }
    }

    // Store filePath separately for easier access
    this.filePath = this.location?.filePath;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldParseError.prototype);
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedParseError {
    return {
      name: this.name,
      message: this.message,
      location: this.location,
      filePath: this.filePath,
      cause: this.errorCause?.message
    };
  }
} 