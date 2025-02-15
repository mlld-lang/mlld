export interface InterpreterLocation {
  line: number;
  column: number;
  filePath?: string;
}

export interface InterpreterErrorContext {
  filePath?: string;
  nodeType?: string;
  location?: InterpreterLocation;
  state?: {
    filePath?: string;
    nodeCount?: number;
  };
  [key: string]: unknown;
}

export interface InterpreterErrorOptions {
  cause?: Error;
  context?: InterpreterErrorContext;
}

export class MeldInterpreterError extends Error {
  public readonly context?: InterpreterErrorContext;
  public readonly cause?: Error;

  constructor(
    message: string,
    public readonly nodeType: string,
    public readonly location?: InterpreterLocation,
    options: InterpreterErrorOptions = {}
  ) {
    const locationStr = location 
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    super(`Interpreter error (${nodeType}): ${message}${locationStr}`);
    
    this.name = 'MeldInterpreterError';
    this.context = options.context;
    this.cause = options.cause;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldInterpreterError.prototype);
  }
} 