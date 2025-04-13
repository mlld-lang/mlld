/**
 * Defines the severity levels for Meld errors.
 */
export enum ErrorSeverity {
  /** The operation can potentially continue */
  Recoverable = 'recoverable',
  /** The operation cannot continue */
  Fatal = 'fatal',
  /** Informational message, not strictly an error */
  Info = 'info',
  /** Warning message */
  Warning = 'warning',
}

/**
 * Represents the source location related to an error.
 */
export interface ErrorSourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  offset?: number;
}

/**
 * Base interface for Meld error details.
 * Specific error types should extend this.
 */
export interface BaseErrorDetails {
  [key: string]: any; // Allow arbitrary context
}

/**
 * Options for creating a MeldError instance.
 */
export interface MeldErrorOptions {
  code: string;
  severity: ErrorSeverity;
  details?: BaseErrorDetails;
  sourceLocation?: ErrorSourceLocation;
  cause?: unknown;
}

/**
 * Base class for all custom Meld errors.
 * Provides structure for error codes, severity, details, and source location.
 */
export class MeldError extends Error {
  /** A unique code identifying the type of error */
  public readonly code: string;
  /** The severity level of the error */
  public readonly severity: ErrorSeverity;
  /** Additional context-specific details about the error */
  public readonly details?: BaseErrorDetails;
  /** Optional source location where the error occurred */
  public readonly sourceLocation?: ErrorSourceLocation;

  constructor(
    message: string,
    options: {
      code: string;
      severity: ErrorSeverity;
      details?: BaseErrorDetails;
      sourceLocation?: ErrorSourceLocation;
      cause?: unknown; // Allow chaining errors
    }
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name; // Set the error name to the class name
    this.code = options.code;
    this.severity = options.severity;
    this.details = options.details;
    this.sourceLocation = options.sourceLocation;

    // Standard way to maintain stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Determines if the error represents a condition that could potentially be
   * treated as a warning rather than a fatal error, based on its severity.
   * Recoverable errors and explicit warnings can potentially be warnings.
   * 
   * @returns {boolean} True if the error severity allows it to be a warning, false otherwise.
   */
  public canBeWarning(): boolean {
    return (
      this.severity === ErrorSeverity.Recoverable || 
      this.severity === ErrorSeverity.Warning
    );
  }

  /**
   * Provides a string representation including code and severity.
   */
  public toString(): string {
    return `${this.name} [${this.code}, ${this.severity}]: ${this.message}`;
  }
} 