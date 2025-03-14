import type {
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  CommentNode,
  NodeType,
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  CommandDefinition,
  CommandMetadata,
  RiskLevel,
  Parser,
  ParserTestCase,
  ValidationError,
  ValidationContext,
  ValidationResult,
  Example
} from '@core/syntax/types.js';

// Re-export all imported types
export type {
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  CommentNode,
  NodeType,
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  CommandDefinition,
  CommandMetadata,
  RiskLevel,
  Parser,
  ParserTestCase,
  ValidationError,
  ValidationContext,
  ValidationResult,
  Example
};

/**
 * Options for configuring the parser behavior
 */
export interface ParserOptions {
  /**
   * Whether to stop parsing on the first error (default: true)
   */
  failFast?: boolean;

  /**
   * Whether to track source locations for nodes (default: true)
   */
  trackLocations?: boolean;

  /**
   * Whether to validate nodes against meld-spec types (default: true)
   */
  validateNodes?: boolean;

  /**
   * Whether to preserve the outer code fence markers in code fence content (default: true).
   * When true, the content will include the opening and closing fence markers.
   * When false, only the content between the fences will be included.
   */
  preserveCodeFences?: boolean;

  /**
   * Custom error handler for parsing errors
   */
  onError?: (error: MeldAstError) => void;
}

/**
 * Result of a successful parse operation
 */
export interface ParseResult {
  /**
   * The AST nodes produced by parsing
   */
  ast: MeldNode[];

  /**
   * Any non-fatal errors encountered during parsing
   * Only present when failFast is false
   */
  errors?: MeldAstError[];
  
  /**
   * Warnings encountered during parsing
   * These are non-fatal issues that don't prevent parsing but may indicate potential problems
   */
  warnings?: MeldAstError[];
}

/**
 * Error thrown during parsing operations
 */
export class MeldAstError extends Error {
  constructor(
    message: string,
    public readonly location?: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    },
    public readonly cause?: Error,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'MeldAstError';
  }

  /**
   * Convert error to JSON format for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      location: this.location,
      cause: this.cause?.message,
      code: this.code
    };
  }

  /**
   * Get a formatted string representation of the error
   */
  toString(): string {
    const parts = [this.message];
    if (this.location) {
      parts.push(`at line ${this.location.start.line}, column ${this.location.start.column}`);
    }
    if (this.code) {
      parts.push(`(code: ${this.code})`);
    }
    return parts.join(' ');
  }
}

/**
 * Error codes for specific parsing failures
 */
export enum ParseErrorCode {
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  GRAMMAR_ERROR = 'GRAMMAR_ERROR'
}

/**
 * Peggy error location information
 */
export interface PeggyLocation {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  offset: number;
  start: {
    offset: number;
    line: number;
    column: number;
  };
  end: {
    offset: number;
    line: number;
    column: number;
  };
}

/**
 * Peggy error structure
 */
export interface PeggyError extends Error {
  location: PeggyLocation;
  expected: Array<{
    type: string;
    text?: string;
    description?: string;
  }>;
  found: string | null;
} 