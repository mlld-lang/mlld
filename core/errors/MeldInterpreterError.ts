import { MeldError, ErrorSeverity } from './MeldError.js';

export interface InterpreterLocation {
  line: number;
  column: number;
  filePath?: string;
}

interface SerializedInterpreterError {
  name: string;
  message: string;
  nodeType: string;
  location?: InterpreterLocation;
  filePath?: string;
  cause?: string;
  fullCauseMessage?: string;
  context?: {
    filePath?: string;
    nodeType?: string;
    nodeCount?: number;
  };
}

export interface InterpreterErrorContext {
  filePath?: string;
  nodeType?: string;
  location?: InterpreterLocation;
  parentFilePath?: string;
  childFilePath?: string;
  state?: {
    filePath?: string;
    nodeCount?: number;
  };
}

export interface MeldInterpreterErrorOptions {
  cause?: Error;
  context?: InterpreterErrorContext;
  severity?: ErrorSeverity;
  code?: string;
}

/**
 * Error thrown during interpretation of Meld content
 */
export class MeldInterpreterError extends MeldError {
  public readonly nodeType: string;
  public readonly location?: InterpreterLocation;

  constructor(
    message: string,
    nodeType: string,
    location?: InterpreterLocation,
    options: MeldInterpreterErrorOptions = {}
  ) {
    // Format message with location if available
    const locationStr = location 
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    
    // Interpreter errors are typically recoverable by default, but can be overridden
    const severity = options.severity || ErrorSeverity.Recoverable;
    
    super(`Interpreter error (${nodeType}): ${message}${locationStr}`, {
      code: options.code || 'INTERPRETATION_FAILED',
      filePath: location?.filePath || options.context?.filePath,
      cause: options.cause,
      severity,
      context: {
        ...options.context,
        nodeType,
        location
      }
    });
    
    this.name = 'MeldInterpreterError';
    this.nodeType = nodeType;
    this.location = location;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldInterpreterError.prototype);
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedInterpreterError {
    return {
      name: this.name,
      message: this.message,
      nodeType: this.nodeType,
      location: this.location,
      filePath: this.filePath,
      cause: this.cause?.message,
      fullCauseMessage: this.cause ? this.getFullCauseMessage(this.cause) : undefined,
      context: this.context ? {
        filePath: this.context.filePath,
        nodeType: this.context.nodeType,
        nodeCount: this.context.state?.nodeCount
      } : undefined
    };
  }

  /**
   * Get the full cause message chain
   */
  private getFullCauseMessage(error: Error): string {
    if (!error) return '';
    
    let message = error.message;
    if ('cause' in error && error.cause instanceof Error) {
      message += ` -> ${this.getFullCauseMessage(error.cause)}`;
    }
    
    return message;
  }
} 