import { parse } from 'meld-ast';
import type { MeldNode } from 'meld-spec';
import { parserLogger as logger } from '@core/utils/logger.js';
import { IParserService } from './IParserService.js';
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

export class ParserService implements IParserService {
  private async parseContent(content: string): Promise<MeldNode[]> {
    // Enable location tracking via a type-cast
    return (parse as any)(content, { locations: true }) as unknown as MeldNode[];
  }

  async parse(content: string): Promise<MeldNode[]> {
    try {
      if (!content) {
        throw new MeldParseError('Empty content provided', { line: 1, column: 1 });
      }
      
      logger.debug('Parsing Meld content', { contentLength: content.length });
      const nodes = await this.parseContent(content);
      logger.debug('Successfully parsed content', { nodeCount: nodes?.length ?? 0 });
      // Map each node to ensure it has default location data if missing
      const nodesWithLocations = (nodes ?? []).map(node => this.addDefaultLocation(node));
      return nodesWithLocations;
    } catch (error) {
      logger.error('Failed to parse content', { error });
      
      if (error instanceof MeldParseError) {
        const defaultLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: content.length || 1 } };
        let loc = error.location;
        if (!loc || !loc.start || loc.start.line == null || loc.start.column == null || !loc.end || loc.end.line == null || loc.end.column == null) {
          loc = defaultLocation;
        }
        throw new MeldParseError(error.message, loc);
      }
      
      if (this.isParseError(error)) {
        const pos = (error.location && error.location.start) ? error.location.start : { line: 1, column: 1 };
        const meldError = new MeldParseError(error.message, pos);
        Object.setPrototypeOf(meldError, MeldParseError.prototype);
        throw meldError;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      const meldError = new MeldParseError(message, { line: 1, column: 1 });
      Object.setPrototypeOf(meldError, MeldParseError.prototype);
      throw meldError;
    }
  }

  // Add default location to a node if missing. For successful parse, we set default location as { start: {1,1}, end: {1,1} }.
  private addDefaultLocation(node: MeldNode): MeldNode {
    if (!node.location ||
        typeof node.location.start.line !== 'number' ||
        typeof node.location.start.column !== 'number' ||
        typeof node.location.end.line !== 'number' ||
        typeof node.location.end.column !== 'number') {
      return { ...node, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } };
    }
    return node;
  }

  async parseWithLocations(content: string, filePath?: string): Promise<MeldNode[]> {
    try {
      logger.debug('Parsing Meld content with locations', { 
        contentLength: content.length,
        filePath 
      });

      const nodes = await this.parse(content);
      if (filePath) {
        return nodes.map(node => {
          if (node.location) {
            return { ...node, location: { ...node.location, filePath } };
          } else {
            return node;
          }
        });
      }
      
      logger.debug('Successfully added locations', { nodeCount: nodes?.length ?? 0 });
      return nodes;
    } catch (error) {
      if (error instanceof MeldParseError) {
        const defaultLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: content.length || 1 } };
        let loc = error.location;
        if (!loc || !loc.start || loc.start.line == null || loc.start.column == null || !loc.end || loc.end.line == null || loc.end.column == null) {
          loc = { ...defaultLocation, filePath };
        }
        throw new MeldParseError(error.message, loc);
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