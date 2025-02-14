import { parse, ParseError } from 'meld-ast';
import type { MeldNode } from 'meld-spec';
import { parserLogger as logger } from '../../core/utils/logger';
import { IParserService } from './IParserService';
import { MeldParseError } from '../../core/errors/MeldParseError';
import type { Location, Position } from '../../core/types';

export class ParserService implements IParserService {
  parse(content: string): MeldNode[] {
    try {
      if (!content) {
        throw new MeldParseError('Empty content provided');
      }
      
      logger.debug('Parsing Meld content', { contentLength: content.length });
      const nodes = parse(content);
      logger.debug('Successfully parsed content', { nodeCount: nodes.length });
      return nodes;
    } catch (error) {
      logger.error('Failed to parse content', { error });
      
      if (error instanceof MeldParseError) {
        throw error;
      }
      
      // Convert meld-ast ParseError to our MeldParseError
      if (this.isParseError(error)) {
        const position: Position = {
          line: error.location.start.line,
          column: error.location.start.column
        };
        throw new MeldParseError(error.message, position);
      }
      
      throw new MeldParseError(
        error instanceof Error ? error.message : 'Unknown parsing error'
      );
    }
  }

  parseWithLocations(content: string, filePath?: string): MeldNode[] {
    try {
      logger.debug('Parsing Meld content with locations', { 
        contentLength: content.length,
        filePath 
      });

      // Parse using base method first
      const nodes = this.parse(content);
      
      // Only add filePath to existing locations by creating new location objects
      if (filePath) {
        return nodes.map(node => ({
          ...node,
          location: node.location ? {
            start: node.location.start,
            end: node.location.end,
            filePath
          } : undefined
        }));
      }

      logger.debug('Successfully added locations', { nodeCount: nodes.length });
      return nodes;
    } catch (error) {
      // Create new error with location instead of modifying existing
      if (error instanceof MeldParseError && error.location && filePath) {
        const location: Location = {
          start: error.location.start,
          end: error.location.end,
          filePath
        };
        throw new MeldParseError(error.message, location);
      }
      throw error;
    }
  }

  private isParseError(error: unknown): error is ParseError {
    return error instanceof Error && 
           'location' in error && 
           typeof (error as any).location?.start?.line === 'number';
  }
} 