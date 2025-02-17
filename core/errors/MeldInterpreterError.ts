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
  state?: {
    filePath?: string;
    nodeCount?: number;
  };
}

export interface InterpreterErrorOptions {
  cause?: Error;
  context?: InterpreterErrorContext;
}

/**
 * Error thrown during interpretation of Meld content
 */
export class MeldInterpreterError extends Error {
  public readonly context?: InterpreterErrorContext;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(
    message: string,
    public readonly nodeType: string,
    public readonly location?: InterpreterLocation,
    options: InterpreterErrorOptions = {}
  ) {
    // Create a clean base message without location details
    const baseMessage = message;

    // Add location details if available
    const locationStr = location ? ` at line ${location.line}, column ${location.column}` : '';
    const fullMessage = `${baseMessage}${locationStr}`;

    super(fullMessage);

    this.name = 'MeldInterpreterError';
    this.context = options.context;
    this.filePath = options.context?.filePath;
    this.errorCause = options.cause;

    // Set cause property for error chaining
    if (options.cause) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: true,
        configurable: true,
      });
    }

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldInterpreterError.prototype);
  }

  get cause(): Error | undefined {
    return this.errorCause;
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
      cause: this.errorCause?.message,
      fullCauseMessage: this.errorCause ? this.getFullCauseMessage(this.errorCause) : undefined,
      context: this.context ? {
        filePath: this.context.filePath,
        nodeType: this.context.nodeType,
        nodeCount: this.context.state?.nodeCount
      } : undefined
    };
  }

  /**
   * Helper to get the full cause message chain
   */
  private getFullCauseMessage(error: Error): string {
    let message = error.message;
    if ('cause' in error && error.cause instanceof Error) {
      message += ` | Caused by: ${this.getFullCauseMessage(error.cause)}`;
    }
    return message;
  }
} 