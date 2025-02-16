import { parse } from 'meld-ast';
import type { MeldNode, TextNode, DirectiveNode } from 'meld-spec';
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
        const defaultLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
        throw new MeldParseError('Empty content provided', defaultLocation);
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
        // Preserve original error location if available and valid
        if (error.location && error.location.start && error.location.end) {
          const meldError = new MeldParseError(error.message, error.location);
          Object.setPrototypeOf(meldError, MeldParseError.prototype);
          throw meldError;
        }
        // Fall back to default location if original is missing or invalid
        const defaultLocation = { 
          start: { line: 1, column: 1 }, 
          end: { line: 1, column: content.length || 1 } 
        };
        const meldError = new MeldParseError(error.message, defaultLocation);
        Object.setPrototypeOf(meldError, MeldParseError.prototype);
        throw meldError;
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      const defaultLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: content.length || 1 } };
      const meldError = new MeldParseError(message, defaultLocation);
      Object.setPrototypeOf(meldError, MeldParseError.prototype);
      throw meldError;
    }
  }

  // Add default location to a node if missing or calculate end column based on content.
  private addDefaultLocation(node: MeldNode): MeldNode {
    const defaultLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
    
    // If location is missing or invalid, set default location
    if (!node.location ||
        typeof node.location.start.line !== 'number' ||
        typeof node.location.start.column !== 'number' ||
        typeof node.location.end.line !== 'number' ||
        typeof node.location.end.column !== 'number') {
      node = { ...node, location: defaultLocation };
    }

    // At this point we know node.location exists and is valid
    const location = node.location!;

    // Calculate end column based on node type and content
    if (node.type === 'Text') {
      const textNode = node as TextNode;
      const firstNewlineIndex = textNode.content.indexOf('\n');
      if (firstNewlineIndex >= 0) {
        if (firstNewlineIndex === 0) {
          // If text starts with newline, use length of content after newline
          const afterNewline = textNode.content.substring(1);
          location.end.column = afterNewline.length + 1;
        } else {
          // If newline is in the middle, use length up to newline
          location.end.column = location.start.column + firstNewlineIndex;
        }
      } else {
        // No newline, use the full content length
        location.end.column = location.start.column + textNode.content.length;
      }
    } else if (node.type === 'Directive') {
      const directiveNode = node as DirectiveNode;
      const directive = directiveNode.directive;
      // Calculate exact length: @kind identifier = "value"
      const length = 1 + // @
                    directive.kind.length + // kind
                    1 + // space after kind
                    directive.identifier.length + // identifier
                    1 + // space before =
                    1 + // =
                    1 + // space after =
                    1 + // opening quote
                    directive.value.length + // value
                    1; // closing quote
      location.end.column = location.start.column + length - 2; // Adjust for 1-based column indexing and string length
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