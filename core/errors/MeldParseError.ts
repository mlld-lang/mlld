export interface Location {
  line: number;
  column: number;
  filePath?: string;
}

export class MeldParseError extends Error {
  public readonly location?: Location;

  constructor(message: string, location?: Location) {
    const locationStr = location 
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    super(`Parse error: ${message}${locationStr}`);
    
    this.name = 'MeldParseError';
    this.location = location;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldParseError.prototype);
  }
} 