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
        structuredPaths: true,
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
    // Since we're using the meld-ast parser with validateNodes=true and preserveCodeFences=true,
    // we can trust that the code fences are already valid.
    // This is just an extra validation layer to ensure code fence integrity
    for (const node of nodes) {
      if (node.type === 'CodeFence') {
        const codeFence = node as CodeFenceNode;
        const content = codeFence.content;
        
        // Skip empty code fences (should be rare but possible)
        if (!content) {
          continue;
        }
        
        // Split the content by lines
        const lines = content.split('\n');
        if (lines.length < 2) {
          throw new MeldParseError(
            'Invalid code fence: must have at least an opening and closing line',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        // Get the first line (opening fence) and count backticks
        const firstLine = lines[0];
        let openTickCount = 0;
        for (let i = 0; i < firstLine.length; i++) {
          if (firstLine[i] === '`') {
            openTickCount++;
          } else {
            break;
          }
        }
        
        // Get the last line (closing fence) and count backticks
        const lastLine = lines[lines.length - 1];
        let closeTickCount = 0;
        for (let i = 0; i < lastLine.length; i++) {
          if (lastLine[i] === '`') {
            closeTickCount++;
          } else {
            break;
          }
        }
        
        if (openTickCount === 0) {
          throw new MeldParseError(
            'Invalid code fence: missing opening backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        if (closeTickCount === 0) {
          throw new MeldParseError(
            'Invalid code fence: missing closing backticks',
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
        
        if (openTickCount !== closeTickCount) {
          throw new MeldParseError(
            `Code fence must be closed with exactly ${openTickCount} backticks, got ${closeTickCount}`,
            node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
          );
        }
      }
    }
  }
} 