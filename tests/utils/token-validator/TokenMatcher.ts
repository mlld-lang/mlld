/**
 * TokenMatcher - Matches semantic tokens to AST node locations
 */

import type { SourceLocation } from '../../../core/types/primitives.js';
import type { SemanticToken, NodeExpectation } from './types.js';

export class TokenMatcher {
  /**
   * Find all tokens that overlap with a given node location
   */
  findOverlappingTokens(
    tokens: SemanticToken[],
    location: SourceLocation
  ): SemanticToken[] {
    const overlapping: SemanticToken[] = [];

    for (const token of tokens) {
      if (this.tokensOverlap(token, location)) {
        overlapping.push(token);
      }
    }

    return overlapping;
  }

  /**
   * Check if a token overlaps with a source location
   */
  private tokensOverlap(token: SemanticToken, location: SourceLocation): boolean {
    const tokenStart = { line: token.line, column: token.char };
    const tokenEnd = { line: token.line, column: token.char + token.length };

    // Token is on the same line as the node start
    if (token.line === location.start.line - 1) {
      // Check if token overlaps with node on this line
      const nodeStartCol = location.start.column - 1; // Convert to 0-based
      const nodeEndCol = location.end.line === location.start.line
        ? location.end.column - 1
        : Number.MAX_SAFE_INTEGER;

      // Check for overlap: token.char < nodeEnd && token.char + token.length > nodeStart
      if (token.char < nodeEndCol && token.char + token.length > nodeStartCol) {
        return true;
      }
    }

    // Token is between start and end lines
    if (token.line > location.start.line - 1 && token.line < location.end.line - 1) {
      return true;
    }

    // Token is on the end line
    if (token.line === location.end.line - 1 && location.end.line > location.start.line) {
      const nodeEndCol = location.end.column - 1;
      if (token.char < nodeEndCol) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if tokens match the expectation
   */
  tokensMatchExpectation(
    tokens: SemanticToken[],
    expectation: NodeExpectation
  ): boolean {
    if (expectation.expectedTokenTypes.length === 0) {
      return true; // No specific token types expected
    }

    // Check if at least one token matches the expected types
    for (const token of tokens) {
      if (expectation.expectedTokenTypes.includes(token.tokenType)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract text for a given location from source
   */
  extractText(source: string, location: SourceLocation): string {
    const lines = source.split('\n');

    if (location.start.line === location.end.line) {
      // Single line
      const line = lines[location.start.line - 1] || '';
      return line.substring(
        location.start.column - 1,
        location.end.column - 1
      );
    }

    // Multi-line
    const result: string[] = [];
    for (let i = location.start.line - 1; i < location.end.line; i++) {
      const line = lines[i] || '';
      if (i === location.start.line - 1) {
        result.push(line.substring(location.start.column - 1));
      } else if (i === location.end.line - 1) {
        result.push(line.substring(0, location.end.column - 1));
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }
}
