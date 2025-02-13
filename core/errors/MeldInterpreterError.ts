export interface InterpreterLocation {
  line: number;
  column: number;
  filePath?: string;
}

export class MeldInterpreterError extends Error {
  constructor(
    message: string,
    public readonly nodeType: string,
    public readonly location?: InterpreterLocation
  ) {
    const locationStr = location 
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    super(`Interpreter error (${nodeType}): ${message}${locationStr}`);
    
    this.name = 'MeldInterpreterError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldInterpreterError.prototype);
  }
} 