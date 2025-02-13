import { parse } from 'meld-ast';
import type { MeldNode } from 'meld-spec';
import { parserLogger as logger } from '../../core/utils/logger';
import { IParserService } from './IParserService';
import { MeldParseError, type Location } from '../../core/errors/MeldParseError';

export class ParserService implements IParserService {
  parse(content: string): MeldNode[] {
    try {
      logger.debug('Parsing Meld content', { contentLength: content.length });
      const nodes = parse(content);
      logger.debug('Successfully parsed content', { nodeCount: nodes.length });
      return nodes;
    } catch (error) {
      logger.error('Failed to parse content', { error });
      if (error instanceof Error) {
        throw new MeldParseError(error.message);
      }
      throw new MeldParseError('Unknown parsing error');
    }
  }

  parseWithLocations(content: string, filePath?: string): MeldNode[] {
    try {
      logger.debug('Parsing Meld content with locations', { 
        contentLength: content.length,
        filePath 
      });

      // Split content into lines for location tracking
      const lines = content.split('\n');
      const nodes = parse(content);

      // Add location information to each node
      for (const node of nodes) {
        if (!node.location) {
          // Calculate approximate location based on content
          const location = this.calculateLocation(node, lines);
          if (location) {
            node.location = {
              ...location,
              filePath
            };
          }
        } else if (filePath) {
          node.location.filePath = filePath;
        }
      }

      logger.debug('Successfully parsed content with locations', { 
        nodeCount: nodes.length 
      });

      return nodes;
    } catch (error) {
      logger.error('Failed to parse content with locations', { error, filePath });
      if (error instanceof Error) {
        throw new MeldParseError(error.message, { line: 1, column: 1, filePath });
      }
      throw new MeldParseError('Unknown parsing error', { line: 1, column: 1, filePath });
    }
  }

  private calculateLocation(node: MeldNode, lines: string[]): Location | undefined {
    // This is a simple implementation that could be improved
    // Currently just finds the first occurrence of the node's content
    if ('content' in node) {
      const content = node.content as string;
      for (let i = 0; i < lines.length; i++) {
        const column = lines[i].indexOf(content);
        if (column !== -1) {
          return {
            line: i + 1,
            column: column + 1
          };
        }
      }
    }
    return undefined;
  }
} 