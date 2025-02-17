import { DirectiveNode } from 'meld-spec';
import { DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import type { Location } from '@core/types/index.js';

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
  INVALID_CONTEXT = 'INVALID_CONTEXT'
}

interface SerializedDirectiveError {
  name: string;
  message: string;
  kind: string;
  code: DirectiveErrorCode;
  location?: Location;
  filePath?: string;
  cause?: string;
  fullCauseMessage?: string;
}

/**
 * Error thrown when directive handling fails
 */
export class DirectiveError extends Error {
  public readonly location?: Location;
  public readonly filePath?: string;
  private readonly errorCause?: Error;

  constructor(
    message: string,
    public readonly kind: string,
    public readonly code: DirectiveErrorCode,
    public readonly details?: {
      node?: DirectiveNode;
      context?: DirectiveContext;
      cause?: Error;
      location?: Location;
      details?: {
        node?: DirectiveNode;
        location?: Location;
      };
    }
  ) {
    // Create message with location if available
    const loc = details?.location ?? details?.node?.location;
    const locationStr = loc ? 
      ` at line ${loc.start.line}, column ${loc.start.column}` : '';
    const filePathStr = details?.context?.currentFilePath ? 
      ` in ${details.context.currentFilePath}` : '';
    
    // Include cause message in the full error message if available
    const causeStr = details?.cause ? ` | Caused by: ${details.cause.message}` : '';
    
    super(`Directive error (${kind}): ${message}${locationStr}${filePathStr}${causeStr}`);
    this.name = 'DirectiveError';
    
    // Store essential properties
    this.location = details?.location ?? details?.node?.location;
    this.filePath = details?.context?.currentFilePath;
    this.errorCause = details?.cause;

    // Set cause property for standard error chaining
    if (details?.cause) {
      Object.defineProperty(this, 'cause', {
        value: details.cause,
        enumerable: true,
        configurable: true,
        writable: false
      });
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, DirectiveError.prototype);
  }

  // Add public getter for cause that ensures we always return the full error
  public get cause(): Error | undefined {
    return this.errorCause;
  }

  /**
   * Custom serialization to avoid circular references and include only essential info
   */
  toJSON(): SerializedDirectiveError {
    return {
      name: this.name,
      message: this.message,
      kind: this.kind,
      code: this.code,
      location: this.location,
      filePath: this.filePath,
      cause: this.errorCause?.message,
      fullCauseMessage: this.errorCause ? this.getFullCauseMessage(this.errorCause) : undefined
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