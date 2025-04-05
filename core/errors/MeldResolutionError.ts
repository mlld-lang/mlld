import { MeldError, ErrorSeverity, BaseErrorDetails, ErrorSourceLocation } from './MeldError.js';
import { Location } from '@core/types/index.js';

/**
 * Represents details specific to general resolution errors.
 */
export interface MeldResolutionErrorDetails extends BaseErrorDetails {
  value?: any; // The value being resolved
  context?: any; // The resolution context or relevant parts
}

export interface ResolutionErrorDetails {
  value?: string;
  context?: string;
  location?: Location;
  variableName?: string;
  variableType?: 'text' | 'data' | 'path' | 'command';
  fieldPath?: string;
  contentPreview?: string;
  error?: string;
  availableHeadings?: string;
  suggestions?: string;
  // Additional properties used in VariableReferenceResolver
  variable?: string;
  field?: string;
  path?: string;
  index?: number;
  length?: number;
  type?: string;
}

export interface MeldResolutionErrorOptions {
  details?: ResolutionErrorDetails;
  code?: string;
  cause?: Error;
  severity?: ErrorSeverity;
  filePath?: string;
}

/**
 * General error thrown during the resolution process for various reasons
 * not covered by more specific error types (like VariableResolutionError or PathValidationError).
 */
export class MeldResolutionError extends MeldError {
  constructor(
    message: string,
    options: {
      code: string; // e.g., E_RESOLVE_FAIL, E_INVALID_CONTEXT, E_TYPE_NOT_ALLOWED
      details?: MeldResolutionErrorDetails;
      severity?: ErrorSeverity;
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

  /**
   * Get a formatted error message including details
   */
  formatMessage(): string {
    let msg = `Resolution error: ${this.message}`;
    if (this.details?.value) {
      msg += `\nValue: ${this.details.value}`;
    }
    if (this.details?.context) {
      msg += `\nContext: ${this.details.context}`;
    }
    if (this.details?.variableName) {
      msg += `\nVariable: ${this.details.variableName}`;
      if (this.details.variableType) {
        msg += ` (${this.details.variableType})`;
      }
    }
    if (this.details?.fieldPath) {
      msg += `\nField path: ${this.details.fieldPath}`;
    }
    return msg;
  }
} 