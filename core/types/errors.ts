/**
 * Error types for AST parsing
 */

/**
 * Error codes for parsing failures
 */
export enum ParseErrorCode {
  INVALID_SYNTAX = 'INVALID_SYNTAX',
  INVALID_NODE = 'INVALID_NODE',
  UNEXPECTED_TOKEN = 'UNEXPECTED_TOKEN',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_DIRECTIVE = 'INVALID_DIRECTIVE'
}

/**
 * AST parsing error
 */
export class MlldAstError extends Error {
  constructor(
    message: string,
    public code: ParseErrorCode,
    public location?: { start: { line: number; column: number }; end: { line: number; column: number } }
  ) {
    super(message);
    this.name = 'MlldAstError';
  }
}

/**
 * Peggy parser error interface
 */
export interface PeggyError {
  message: string;
  location?: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
  expected?: Array<{ type: string; description?: string }>;
  found?: string;
}

/**
 * Parser options
 */
export interface ParserOptions {
  failFast?: boolean;
  trackLocations?: boolean;
  validateNodes?: boolean;
  preserveCodeFences?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Parse result
 */
export interface ParseResult {
  success: boolean;
  nodes?: any[];
  errors?: Error[];
}