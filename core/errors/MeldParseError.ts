import type { Location, Position } from '@core/types.js';

/**
 * Error thrown when parsing Meld content fails
 */
export class MeldParseError extends Error {
  /**
   * Location information for where the error occurred
   */
  public readonly location?: Location;

  constructor(message: string, position?: Position | Location) {
    // Format message with location if available
    const locationStr = position ? 
      ` at line ${('line' in position ? position.line : position.start.line)}, ` +
      `column ${('column' in position ? position.column : position.start.column)}` +
      (('filePath' in position && position.filePath) ? ` in ${position.filePath}` : '')
      : '';
    
    super(`Parse error: ${message}${locationStr}`);
    this.name = 'MeldParseError';

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

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldParseError.prototype);
  }
} 