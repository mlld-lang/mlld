export interface DirectiveLocation {
  line: number;
  column: number;
  filePath?: string;
}

export class MeldDirectiveError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    public readonly directiveKind: string,
    public readonly location?: DirectiveLocation,
    code: string = 'VALIDATION_FAILED'
  ) {
    const locationStr = location 
      ? ` at line ${location.line}, column ${location.column}${location.filePath ? ` in ${location.filePath}` : ''}`
      : '';
    super(`Directive error (${directiveKind}): ${message}${locationStr}`);
    
    this.name = 'MeldDirectiveError';
    this.code = code;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldDirectiveError.prototype);
  }
} 