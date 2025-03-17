import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { Location } from '@core/types/index.js';

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
 * Error thrown when variable resolution fails
 */
export class MeldResolutionError extends MeldError {
  public readonly details?: ResolutionErrorDetails;

  constructor(
    message: string,
    options: MeldResolutionErrorOptions = {}
  ) {
    // Resolution errors are typically recoverable by default
    const severity = options.severity || ErrorSeverity.Recoverable;
    
    super(message, {
      code: options.code || 'RESOLUTION_FAILED',
      filePath: options.filePath || options.details?.location?.filePath,
      cause: options.cause,
      severity,
      context: options.details
    });
    
    this.name = 'MeldResolutionError';
    this.details = options.details;
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