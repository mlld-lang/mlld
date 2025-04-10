import { MeldError, ErrorSeverity, BaseErrorDetails, ErrorSourceLocation } from './MeldError.js';
import type { VariableType, ResolutionContext } from '@core/types.js';

/**
 * Represents details specific to variable resolution errors.
 */
export interface VariableResolutionErrorDetails extends BaseErrorDetails {
  variableName: string;
  variableType?: VariableType;
  resolutionContext?: Partial<ResolutionContext>; // Include relevant context if available
  availableVariables?: string[]; // Potentially list available vars for debugging
}

/**
 * Error thrown when resolving a variable fails
 * (e.g., variable not found, type mismatch, circular reference).
 */
export class VariableResolutionError extends MeldError {
  constructor(
    message: string,
    options: {
      code: string; // Specific code like E_VAR_NOT_FOUND, E_CIRCULAR_REF, E_TYPE_MISMATCH
      details: VariableResolutionErrorDetails;
      severity?: ErrorSeverity; // Defaults to Recoverable? Might depend on code
      sourceLocation?: ErrorSourceLocation;
      cause?: unknown;
    }
  ) {
    super(message, {
      code: options.code,
      severity: options.severity || ErrorSeverity.Recoverable,
      details: options.details,
      sourceLocation: options.sourceLocation,
      cause: options.cause,
    });
  }
} 