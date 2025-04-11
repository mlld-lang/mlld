import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { Location } from '@core/types/index.js';
import { MeldDirectiveError, DirectiveLocation, MeldDirectiveErrorOptions } from '@core/errors/MeldDirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Error codes for directive failures
 */
export enum DirectiveErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  RESOLUTION_FAILED = 'RESOLUTION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  STATE_ERROR = 'STATE_ERROR',
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND'
}

/**
 * Map directive error codes to severity levels
 */
export const DirectiveErrorSeverity: Record<DirectiveErrorCode, ErrorSeverity> = {
  [DirectiveErrorCode.VALIDATION_FAILED]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.RESOLUTION_FAILED]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.EXECUTION_FAILED]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.HANDLER_NOT_FOUND]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.FILE_NOT_FOUND]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.CIRCULAR_REFERENCE]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.VARIABLE_NOT_FOUND]: ErrorSeverity.Recoverable,
  [DirectiveErrorCode.STATE_ERROR]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.INVALID_CONTEXT]: ErrorSeverity.Fatal,
  [DirectiveErrorCode.SECTION_NOT_FOUND]: ErrorSeverity.Recoverable
};

export interface DirectiveErrorDetails {
  node?: DirectiveNode;
  context?: DirectiveContext;
  cause?: Error;
  location?: Location;
  details?: {
    node?: DirectiveNode;
    location?: Location;
  };
}

/**
 * Error thrown when directive handling fails
 */
export class DirectiveError extends MeldDirectiveError {
  public readonly code: DirectiveErrorCode;
  public readonly details?: DirectiveErrorDetails;

  constructor(
    message: string,
    kind: string,
    code: DirectiveErrorCode,
    details?: DirectiveErrorDetails
  ) {
    // Convert Location to DirectiveLocation if available
    let directiveLocation: DirectiveLocation | undefined;
    const loc = details?.location ?? details?.node?.location;
    
    if (loc?.start) {
      directiveLocation = {
        line: loc.start.line,
        column: loc.start.column,
        filePath: details?.context?.currentFilePath
      };
    }
    
    // Determine severity based on error code
    const severity = DirectiveErrorSeverity[code] || ErrorSeverity.Recoverable;
    
    // Create options for MeldDirectiveError
    const options: MeldDirectiveErrorOptions = {
      location: directiveLocation,
      code,
      cause: details?.cause,
      severity,
      context: details
    };
    
    super(message, kind, options);
    
    this.name = 'DirectiveError';
    this.code = code;
    this.details = details;
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, DirectiveError.prototype);
  }
} 