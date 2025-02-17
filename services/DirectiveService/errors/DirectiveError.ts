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

/**
 * Error thrown when directive handling fails
 */
export class DirectiveError extends Error {
  public readonly location?: Location;
  public readonly cause?: Error;

  constructor(
    message: string,
    public readonly kind: string,
    public readonly code: DirectiveErrorCode,
    public readonly details?: {
      node?: DirectiveNode;
      context?: DirectiveContext;
      cause?: Error;
      location?: Location;
    }
  ) {
    super(`Directive error (${kind}): ${message}`);
    this.name = 'DirectiveError';
    this.location = details?.location ?? details?.node?.location;
    this.cause = details?.cause;
  }
} 