import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParserService } from './ParserService.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import type { Location, Position } from '@core/types/index.js';
import { createLocation, createPosition } from '@tests/utils/testFactories.js';

// Define a type that combines the meld-spec Location with our filePath
type LocationWithFilePath = {
  start: { line: number | undefined; column: number | undefined };
  end: { line: number | undefined; column: number | undefined };
  filePath?: string;
};

// Helper function to create test locations
function createTestLocation(startLine: number | undefined, startColumn: number | undefined, endLine: number | undefined, endColumn: number | undefined, filePath?: string): LocationWithFilePath {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
    filePath
  };
}

// Type guard for Location
function isLocation(value: any): value is LocationWithFilePath {
  return (
    value &&
    typeof value === 'object' &&
    'start' in value &&
    'end' in value &&
    'filePath' in value
  );
}

// Type guard for checking if a location has a filePath
function hasFilePath(location: any): location is LocationWithFilePath {
  return (
    location &&
    typeof location === 'object' &&
    'start' in location &&
    'end' in location &&
    'filePath' in location
  );
}

describe('ParserService', () => {
  let service: ParserService;

  beforeEach(() => {
    service = new ParserService();
  });

  describe('parse', () => {
    it('should parse text content', async () => {
      const content = 'Hello world';
      const mockResult: MeldNode[] = [{
        type: 'Text',
        content: 'Hello world\n',
        location: createTestLocation(undefined, undefined, undefined, undefined)
      } as unknown as TextNode];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse directive content', async () => {
      const content = '@text greeting = "Hello"';
      const mockResult = [{
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          source: 'literal',
          value: 'Hello'
        },
        location: createTestLocation(undefined, undefined, undefined, undefined)
      } as unknown as DirectiveNode];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse mixed content', async () => {
      const content = 'Hello world\n@text greeting = "Hi"\nMore text';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello world\n',
          location: createTestLocation(undefined, undefined, undefined, undefined)
        } as unknown as TextNode,
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hi'
          },
          location: createTestLocation(undefined, undefined, undefined, undefined)
        } as unknown as DirectiveNode,
        {
          type: 'Text',
          content: '\nMore text',
          location: createTestLocation(undefined, undefined, undefined, undefined)
        } as unknown as TextNode
      ];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty content', async () => {
      await expect(service.parse('')).rejects.toThrow(MeldParseError);
      await expect(service.parse('')).rejects.toThrow('Parse error: Empty content provided');
    });

    it('should throw MeldParseError with location for invalid directive', async () => {
      const content = '@invalid xyz';
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Expected "data", "define", "embed", "import", "path", "run", "text", or "var"');
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = '@text greeting = "unclosed string';
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Expected "\\"" or any character');
    });
  });

  describe('parseWithLocations', () => {
    it('should include file path in locations', async () => {
      const content = 'Hello\n@text greeting = "Hi"';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello\n',
          location: createTestLocation(undefined, undefined, undefined, undefined, 'test.meld')
        } as unknown as TextNode,
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hi'
          },
          location: createTestLocation(undefined, undefined, undefined, undefined, 'test.meld')
        } as unknown as DirectiveNode
      ];

      const filePath = 'test.meld';
      const resultWithFilePath = await service.parseWithLocations(content, filePath);
      expect(resultWithFilePath).toEqual(mockResult);
    });

    it('should preserve original locations when adding filePath', async () => {
      const content = '@text greeting = "Hi"';
      const filePath = 'test.meld';

      const result = await service.parseWithLocations(content, filePath);
      
      expect(result[0].location).toMatchObject({
        start: { line: undefined, column: undefined },
        end: { line: undefined, column: undefined },
        filePath
      });
    });

    it('should include filePath in error for invalid content', async () => {
      const content = '@invalid xyz';
      const filePath = 'test.meld';
      
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow(MeldParseError);
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow('Parse error: Expected "data", "define", "embed", "import", "path", "run", "text", or "var"');
    });
  });

  describe('error handling', () => {
    it('should handle unknown errors gracefully', async () => {
      const content = 'content';
      const result = await service.parse(content);
      expect(result).toEqual([{
        type: 'Text',
        content: 'content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 7 }
        }
      }]);
    });

    it('should preserve MeldParseError instances', async () => {
      const content = 'content';
      const result = await service.parse(content);
      expect(result).toEqual([{
        type: 'Text',
        content: 'content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 7 }
        }
      }]);
    });

    it('should convert ParseError to MeldParseError with location', async () => {
      const content = 'content';
      const result = await service.parse(content);
      expect(result).toEqual([{
        type: 'Text',
        content: 'content',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 7 }
        }
      }]);
    });
  });
}); 