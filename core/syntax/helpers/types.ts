import { 
  MeldError, 
  MeldParseError, 
  DirectiveError,
  MeldResolutionError,
  ErrorSeverity,
  DirectiveErrorCode
} from '@core/errors.js';

/**
 * Represents a syntax example with code and description
 */
export interface SyntaxExample {
  /** The example code */
  code: string;
  /** Description of what the example demonstrates */
  description: string;
}

/**
 * Represents an invalid syntax example with expected error information
 */
export interface InvalidSyntaxExample extends SyntaxExample {
  expectedError: {
    /** The error constructor type */
    type: typeof MeldError | typeof MeldParseError | typeof DirectiveError | typeof MeldResolutionError;
    /** Error severity level */
    severity: ErrorSeverity;
    /** Error code */
    code: string | DirectiveErrorCode;
    /** Expected error message or message fragment */
    message: string;
  };
}

/**
 * Group of related syntax examples
 */
export interface SyntaxExampleGroup {
  /** Atomic examples (basic building blocks) */
  atomic: Record<string, SyntaxExample>;
  /** Combined examples built from atomic examples */
  combinations: Record<string, SyntaxExample>;
  /** Invalid syntax examples with expected errors */
  invalid: Record<string, InvalidSyntaxExample>;
} 