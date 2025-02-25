import type { Location, Position } from '@core/types/index.js';
import { MeldError, ErrorSeverity } from './MeldError.js';

interface SerializedParseError {
  name: string;
  message: string;
  location?: Location;
  filePath?: string;
  cause?: string;
  severity: ErrorSeverity;
  context?: any;
}

export interface MeldParseErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

/**
 * Error thrown when parsing Meld content fails
 */
export class MeldParseError extends MeldError {
  /**
   * Location information for where the error occurred
   */
  public readonly location?: Location;

  constructor(
    message: string, 
    position?: Position | Location,
    options: MeldParseErrorOptions = {}
  ) {
    // Format message with location if available
    const locationStr = position ? 
      ` at line ${('line' in position ? position.line : position.start.line)}, ` +
      `column ${('column' in position ? position.column : position.start.column)}` +
      (('filePath' in position && position.filePath) ? ` in ${position.filePath}` : '')
      : '';
    
    // Convert Position to Location if needed
    let location: Location | undefined;
    let filePath: string | undefined;
    
    if (position) {
      if ('line' in position) {
        // It's a Position
        location = {
          start: position,
          end: position,
          filePath: undefined
        };
      } else {
        // It's already a Location
        location = position;
      }
      
      // Store filePath separately for easier access
      filePath = location?.filePath;
    }
    
    // Parse errors are typically fatal, but can be overridden
    const severity = options.severity || ErrorSeverity.Fatal;
    
    super(`Parse error: ${message}${locationStr}`, {
      cause: options.cause,
      filePath,
      severity,
      context: {
        ...options.context,
        location
      }
    });
    
    this.name = 'MeldParseError';
    this.location = location;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldParseError.prototype);
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedParseError {
    return {
      ...super.toJSON(),
      name: this.name,
      location: this.location
    } as SerializedParseError;
  }
} 