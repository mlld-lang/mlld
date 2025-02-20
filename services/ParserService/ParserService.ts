import { IParserService } from './IParserService.js';
import type { MeldNode, CodeFenceNode } from 'meld-spec';
import { parserLogger as logger } from '@core/utils/logger.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { Location, Position } from '@core/types/index.js';

// Define our own ParseError type since it's not exported from meld-ast
interface ParseError {
  message: string;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface MeldAstError {
  message: string;
  location?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  toString(): string;
}

function isMeldAstError(error: unknown): error is MeldAstError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).toString === 'function'
  );
}

export class ParserService implements IParserService {
  private async parseContent(content: string): Promise<MeldNode[]> {
    try {
      const { parse } = await import('meld-ast');
      const options = {
        failFast: true,
        trackLocations: true,
        validateNodes: true,
        preserveCodeFences: true,
        validateCodeFences: true,
        onError: (error: unknown) => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        }
      };

      const result = await parse(content, options);
      
      // Validate code fence nesting
      this.validateCodeFences(result.ast || []);

      // Log any non-fatal errors
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          if (isMeldAstError(error)) {
            logger.warn('Parse warning', { error: error.toString() });
          }
        });
      }

      return result.ast || [];
    } catch (error) {
      if (isMeldAstError(error)) {
        // Preserve original error message and location
        throw new MeldParseError(
          error.message,
          error.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        );
      }
      // For unknown errors, provide a generic message
      throw new MeldParseError(
        'Parse error: Unknown error occurred',
        { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
      );
    }
  }

  public async parse(content: string): Promise<MeldNode[]> {
    return this.parseContent(content);
  }

  public async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    const nodes = await this.parseContent(content);
    if (!filePath) {
      return nodes;
    }

    return nodes.map(node => {
      if (node.location) {
        // Preserve exact column numbers from original location
        return {
          ...node,
          location: {
            ...node.location,  // Preserve all original location properties
            filePath          // Only add filePath
          }
        };
      }
      return node;
    });
  }

  private isParseError(error: unknown): error is ParseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      'location' in error &&
      typeof error.location === 'object' &&
      error.location !== null &&
      'start' in error.location &&
      'end' in error.location
    );
  }

  private validateCodeFences(nodes: MeldNode[]): void {
    // No validation needed since meld-ast handles code fence validation
    // according to its grammar which allows equal or greater number of
    // backticks to close a fence
  }
} 