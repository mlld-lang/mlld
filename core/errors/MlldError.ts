/**
 * Defines the severity levels for mlld errors.
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

import { SourceLocation } from '@core/types';

import type { DirectiveTrace } from '@core/types/trace';
import type { Environment } from '@interpreter/env/Environment';

/**
 * Base interface for mlld error details.
 * Specific error types should extend this.
 */
export interface BaseErrorDetails {
  directiveTrace?: DirectiveTrace[]; // Optional directive trace
  [key: string]: any; // Allow arbitrary context
}

/**
 * Options for creating a MlldError instance.
 */
export interface MlldErrorOptions {
  code: string;
  severity: ErrorSeverity;
  details?: BaseErrorDetails;
  sourceLocation?: SourceLocation;
  cause?: unknown;
  env?: Environment; // Optional environment for source access
}

import { formatLocationForError } from '@core/utils/locationFormatter';

/**
 * Base class for all custom mlld errors.
 * Provides structure for error codes, severity, details, and source location.
 */
export class MlldError extends Error {
  /** A unique code identifying the type of error */
  public readonly code: string;
  /** The severity level of the error */
  public readonly severity: ErrorSeverity;
  /** Additional context-specific details about the error */
  public readonly details?: BaseErrorDetails;
  /** Optional source location where the error occurred */
  public readonly sourceLocation?: SourceLocation;
  /** Optional environment for source access */
  private readonly env?: Environment;

  constructor(
    message: string,
    options: {
      code: string;
      severity: ErrorSeverity;
      details?: BaseErrorDetails;
      sourceLocation?: SourceLocation;
      cause?: unknown; // Allow chaining errors
      env?: Environment; // Optional environment for source access
    }
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name; // Set the error name to the class name
    this.code = options.code;
    this.severity = options.severity;
    this.details = options.details;
    this.sourceLocation = options.sourceLocation;
    this.env = options.env;

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
   * Get source context for error display
   */
  private getSourceContext(): string | undefined {
    if (!this.sourceLocation || !this.env) {
      return undefined;
    }
    
    const filePath = this.sourceLocation.filePath;
    if (!filePath) {
      return undefined;
    }
    
    const source = this.env.getSource(filePath);
    if (!source || !this.sourceLocation.line) {
      return undefined;
    }
    
    return this.formatSourceContext(source);
  }
  
  /**
   * Format source context with visual indicators
   */
  private formatSourceContext(source: string): string {
    const lines = source.split('\n');
    const lineNum = this.sourceLocation!.line! - 1; // Convert to 0-based index
    
    if (lineNum < 0 || lineNum >= lines.length) {
      return '';
    }
    
    const errorLine = lines[lineNum];
    const column = this.sourceLocation!.column || 1;
    const pointer = ' '.repeat(column - 1) + '^';
    
    // Include surrounding context (2 lines before/after)
    const contextStart = Math.max(0, lineNum - 2);
    const contextEnd = Math.min(lines.length - 1, lineNum + 2);
    
    let result = '';
    for (let i = contextStart; i <= contextEnd; i++) {
      const lineNumber = String(i + 1).padStart(4, ' ');
      const marker = i === lineNum ? '>' : ' ';
      result += `${marker} ${lineNumber} | ${lines[i]}\n`;
      
      if (i === lineNum && this.sourceLocation!.column) {
        result += `       | ${pointer}\n`;
      }
    }
    
    return result;
  }

  /**
   * Provides a string representation including code and severity.
   */
  public toString(): string {
    let result = `[${this.code}] ${this.message}`;
    
    if (this.sourceLocation) {
      result += ` at ${formatLocationForError(this.sourceLocation)}`;
    }
    
    result += ` (Severity: ${this.severity})`;
    
    const sourceContext = this.getSourceContext();
    if (sourceContext) {
      result += '\n\n' + sourceContext;
    }
    
    return result;
  }

  /**
   * Serializes the error to JSON with formatted location string.
   */
  public toJSON(): Record<string, any> {
    const result: Record<string, any> = {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
    };

    if (this.details) {
      result.details = this.details;
    }

    if (this.sourceLocation) {
      result.sourceLocation = formatLocationForError(this.sourceLocation);
    }

    return result;
  }
} 