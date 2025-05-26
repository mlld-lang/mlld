/**
 * Mlld Parser Entry Point
 * 
 * Provides the main parsing functionality for Mlld documents.
 * Re-exports the generated parser and related types.
 */

// Import the generated parser
import parser from './parser.js';

// Import types
import type { MlldNode } from '@core/types';

/**
 * Parser options
 */
export interface ParserOptions {
  /** Starting rule (default: 'Start') */
  startRule?: string;
  /** Additional options passed to PEG parser */
  [key: string]: any;
}

/**
 * Parser result
 */
export interface ParseResult {
  /** The parsed AST */
  ast: MlldNode[];
  /** Whether parsing succeeded */
  success: boolean;
  /** Error if parsing failed */
  error?: Error;
}

/**
 * Parse Mlld source code into an AST
 * 
 * @param source The Mlld source code to parse
 * @param options Parser options
 * @returns The parsed AST nodes
 * @throws {SyntaxError} If the source code is invalid
 */
export async function parse(source: string, options?: ParserOptions): Promise<ParseResult> {
  try {
    const ast = parser.parse(source, {
      startRule: 'Start',
      ...options
    });
    
    return {
      ast,
      success: true
    };
  } catch (error) {
    return {
      ast: [],
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Synchronous parse function for compatibility
 */
export function parseSync(source: string, options?: ParserOptions): MlldNode[] {
  return parser.parse(source, {
    startRule: 'Start',
    ...options
  });
}

// Re-export the parser and SyntaxError
export { parser };
export const SyntaxError = parser.SyntaxError;

// Export types
export type { MlldNode } from '@core/types';