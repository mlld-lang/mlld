import type { Location, Position } from '@core/types/index';
import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import { formatLocationForError } from '@core/utils/locationFormatter';

interface SerializedParseError {
  name: string;
  message: string;
  code: string;
  severity: ErrorSeverity;
  location?: Location;
  sourceLocation?: string;
  filePath?: string;
  cause?: string;
  details?: any;
}

export interface MlldParseErrorOptions {
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
  filePath?: string; // Add filePath to options
  sourceContent?: string; // Add source content for displaying context
}

/**
 * Error thrown when parsing Mlld content fails
 */
export class MlldParseError extends MlldError {
  /**
   * Location information for where the error occurred
   */
  public readonly location?: Location;
  // Explicitly store the cause passed in options
  public readonly cause?: unknown;
  // Store source content for error display
  public readonly sourceContent?: string;

  constructor(
    message: string, 
    position?: Position | Location,
    options: MlldParseErrorOptions = {}
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
    
    // Debug logging
    console.debug('[MlldParseError Debug] Constructor called:', {
      message,
      position,
      location,
      filePath: options.filePath || filePath,
      hasSourceLocation: !!location
    });
    
    super(`Parse error: ${message}${locationStr}`, {
      // Pass filePath via details, not directly
      code: 'PARSE_ERROR', // Assign a default code or get from options if needed
      severity,
      details: {
        ...options.context, // Keep existing context details
        filePath: options.filePath || filePath,
        sourceContent: options.sourceContent // Store source content in details
      },
      sourceLocation: location, // Use sourceLocation for the parsed location
      cause: options.cause
    });
    
    this.name = 'MlldParseError';
    this.location = location; // Keep this for direct access if needed
    this.cause = options.cause; // Store the cause
    this.sourceContent = options.sourceContent; // Store source content
    
    console.debug('[MlldParseError Debug] Created error with sourceLocation:', this.sourceLocation);

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MlldParseError.prototype);
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedParseError {
    const cause = this.cause;
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      location: this.location,
      sourceLocation: this.sourceLocation ? formatLocationForError(this.sourceLocation) : undefined,
      filePath: this.details?.filePath,
      cause: cause instanceof Error ? cause.message : String(cause),
      details: this.details
    } as SerializedParseError;
  }
} 