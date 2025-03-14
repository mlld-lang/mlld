import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';

export interface DirectiveLocation {
  line: number;
  column: number;
  filePath?: string;
}

export interface MeldDirectiveErrorOptions {
  location?: DirectiveLocation;
  code?: string;
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
}

export class MeldDirectiveError extends MeldError {
  public readonly directiveKind: string;
  public readonly location?: DirectiveLocation;

  constructor(
    message: string,
    directiveKind: string,
    options: MeldDirectiveErrorOptions = {}
  ) {
    const locationStr = options.location 
      ? ` at line ${options.location.line}, column ${options.location.column}${options.location.filePath ? ` in ${options.location.filePath}` : ''}`
      : '';
    
    super(`Directive error (${directiveKind}): ${message}${locationStr}`, {
      code: options.code || 'VALIDATION_FAILED',
      filePath: options.location?.filePath,
      cause: options.cause,
      severity: options.severity || ErrorSeverity.Recoverable, // Default to recoverable for directive errors
      context: {
        ...options.context,
        directiveKind,
        location: options.location
      }
    });
    
    this.name = 'MeldDirectiveError';
    this.directiveKind = directiveKind;
    this.location = options.location;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MeldDirectiveError.prototype);
  }
} 