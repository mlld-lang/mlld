import { MeldError, ErrorSeverity, BaseErrorDetails, ErrorSourceLocation } from './MeldError.js';
import type { FieldAccess } from '@core/types/index.js'; // Correct the import path for FieldAccess

/**
 * Represents an error during field access on a data variable.
 */
export interface FieldAccessErrorDetails extends BaseErrorDetails {
  variableName: string;
  fieldAccessChain: FieldAccess[];
  failedAtIndex: number; // Index in the chain where access failed
  targetValue?: any; // The value being accessed when it failed (if available)
}

/**
 * Error thrown when accessing a field on a data variable fails.
 * (e.g., field doesn't exist, accessing non-object/array).
 */
export class FieldAccessError extends MeldError {
  constructor(
    message: string,
    options: {
      details: FieldAccessErrorDetails;
      sourceLocation?: ErrorSourceLocation;
      cause?: unknown;
    }
  ) {
    super(message, {
      code: options.details?.code ?? 'E_FIELD_ACCESS',
      severity: options.details?.severity ?? ErrorSeverity.Recoverable,
      details: options.details,
      sourceLocation: options.sourceLocation,
      cause: options.cause,
    });
  }
} 