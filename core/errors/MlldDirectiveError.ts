import { MlldError, ErrorSeverity } from '@core/errors/MlldError';
import type { Environment } from '@interpreter/env/Environment';

export interface DirectiveLocation {
  line: number;
  column: number;
  filePath?: string;
}

/** SourceLocation from AST nodes: { start: { line, column }, end: { line, column } } */
interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface MlldDirectiveErrorOptions {
  location?: DirectiveLocation | SourceLocation;
  code?: string;
  cause?: Error;
  severity?: ErrorSeverity;
  context?: any;
  env?: Environment;
}

export class MlldDirectiveError extends MlldError {
  public readonly directiveKind: string;
  public readonly location?: DirectiveLocation;

  constructor(
    message: string,
    directiveKind: string,
    options: MlldDirectiveErrorOptions = {}
  ) {
    // Normalize location: SourceLocation { start, end } → DirectiveLocation { line, column }
    const loc = options.location
      ? ('start' in options.location
          ? { line: options.location.start.line, column: options.location.start.column }
          : options.location as DirectiveLocation)
      : undefined;
    const locationStr = loc
      ? ` at line ${loc.line}, column ${loc.column}${loc.filePath ? ` in ${loc.filePath}` : ''}`
      : '';
    
    super(`Directive error (${directiveKind}): ${message}${locationStr}`, {
      code: options.code || 'VALIDATION_FAILED',
      cause: options.cause,
      severity: options.severity || ErrorSeverity.Recoverable, // Default to recoverable for directive errors
      // Pass context and filePath via details
      details: {
        ...options.context,
        directiveKind,
        filePath: loc?.filePath, // Add filePath to details
        // Keep location in details as well if needed for context
        location: loc
      },
      // Pass location as sourceLocation
      sourceLocation: loc,
      // Pass environment for source access
      env: options.env
    });
    
    this.name = 'MlldDirectiveError';
    this.directiveKind = directiveKind;
    this.location = loc;
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, MlldDirectiveError.prototype);
  }
} 