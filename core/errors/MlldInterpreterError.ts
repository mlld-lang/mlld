import { MlldError, ErrorSeverity } from '@core/errors/MlldError';

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
  severity: ErrorSeverity;
  code?: string;
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

export interface MlldInterpreterErrorOptions {
  cause?: Error;
  context?: InterpreterErrorContext;
  severity?: ErrorSeverity;
  code?: string;
}

/**
 * Error thrown during interpretation of Mlld content
 */
export class MlldInterpreterError extends MlldError {
  public readonly nodeType: string;
  public readonly location?: InterpreterLocation;
  public readonly context?: InterpreterErrorContext;
  public readonly cause?: unknown;

  constructor(
    message: string,
    nodeType: string,
    location?: InterpreterLocation,
    options: MlldInterpreterErrorOptions = {}
  ) {
    // Format message with location if available
    const locationStr = location 
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    
    // Interpreter errors are typically recoverable by default, but can be overridden
    const severity = options.severity || ErrorSeverity.Recoverable;
    const filePath = location?.filePath || options.context?.filePath;
    
    super(`Interpreter error (${nodeType}): ${message}${locationStr}`, {
      code: options.code || 'INTERPRETATION_FAILED',
      cause: options.cause,
      severity,
      details: {
        ...options.context,
        filePath: filePath,
        nodeType: nodeType
      },
      sourceLocation: location
    });
    
    this.name = 'MlldInterpreterError';
    this.nodeType = nodeType;
    this.location = location;
    this.context = options.context;
    this.cause = options.cause;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MlldInterpreterError.prototype);
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedInterpreterError {
    const cause = this.cause;
    return {
      name: this.name,
      message: this.message,
      nodeType: this.nodeType,
      location: this.location,
      filePath: this.location?.filePath,
      cause: cause instanceof Error ? cause.message : String(cause),
      fullCauseMessage: cause instanceof Error ? this.getFullCauseMessage(cause) : undefined,
      severity: this.severity,
      code: this.code,
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
    
    let message = error.message || 'Unknown error';
    if ('cause' in error) {
      const cause = error.cause as unknown;
      if (cause instanceof Error) {
        message += ` -> ${this.getFullCauseMessage(cause)}`;
      }
    }
    
    return message;
  }
} 