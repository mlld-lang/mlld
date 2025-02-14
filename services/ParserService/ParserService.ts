import { parse, ParseError } from 'meld-ast';
import type { MeldNode } from 'meld-spec';
import { parserLogger as logger } from '../../core/utils/logger';
import { IParserService } from './IParserService';
import { MeldParseError } from '../../core/errors/MeldParseError';
import type { Location, Position } from '../../core/types';

export class ParserService implements IParserService {
  async parse(content: string): Promise<MeldNode[]> {
    try {
      if (!content) {
        throw new MeldParseError('Empty content provided', { line: 1, column: 1 });
      }
      
      logger.debug('Parsing Meld content', { contentLength: content.length });
      const nodes = parse(content);
      logger.debug('Successfully parsed content', { nodeCount: nodes?.length ?? 0 });
      return nodes ?? [];
    } catch (error) {
      logger.error('Failed to parse content', { error });
      
      if (error instanceof MeldParseError) {
        throw error;
      }
      
      // Convert meld-ast ParseError to our MeldParseError
      if (this.isParseError(error)) {
        const location: Location = {
          start: {
            line: error.location.start.line,
            column: error.location.start.column
          },
          end: {
            line: error.location.end.line,
            column: error.location.end.column
          }
        };
        throw new MeldParseError(error.message, location);
      }
      
      // Wrap unknown errors in MeldParseError
      throw new MeldParseError(
        error instanceof Error ? error.message : 'Unknown error',
        { line: 1, column: 1 }
      );
    }
  }

  async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    try {
      logger.debug('Parsing Meld content with locations', { 
        contentLength: content.length,
        filePath 
      });

      // Parse using base method first
      const nodes = await this.parse(content);
      
      // Only add filePath to existing locations by creating new location objects
      if (filePath) {
        return nodes.map(node => {
          if (!node?.location) return node;
          return {
            ...node,
            location: {
              start: node.location.start,
              end: node.location.end,
              filePath
            }
          };
        });
      }

      logger.debug('Successfully added locations', { nodeCount: nodes?.length ?? 0 });
      return nodes;
    } catch (error) {
      // Create new error with location instead of modifying existing
      if (error instanceof MeldParseError) {
        const location: Location = {
          start: error.location?.start ?? { line: 1, column: 1 },
          end: error.location?.end ?? { line: 1, column: 1 },
          filePath
        };
        throw new MeldParseError(error.message, location);
      }
      throw error;
    }
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
} 