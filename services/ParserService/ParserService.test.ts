import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParserService } from './ParserService';
import { MeldParseError } from '../../core/errors/MeldParseError';
import type { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import type { Location, Position } from '../../core/types';
import { createLocation, createPosition } from '../../tests/utils/testFactories';

// Define a type that combines the meld-spec Location with our filePath
type LocationWithFilePath = {
  start: { line: number; column: number };
  end: { line: number; column: number };
  filePath?: string;
};

// Helper function to create test locations
function createTestLocation(startLine: number, startColumn: number, endLine: number, endColumn: number, filePath?: string): Location {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
    filePath
  };
}

// Type guard for Location
function isLocation(value: any): value is Location {
  return (
    value &&
    typeof value === 'object' &&
    'start' in value &&
    'end' in value &&
    'filePath' in value
  );
}

// Type guard for checking if a location has a filePath
function hasFilePath(location: any): location is Location {
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
        content: 'Hello world',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 11 }
        }
      } as TextNode];

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
          value: '"Hello"'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 24 }
        }
      }];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse mixed content', async () => {
      const content = 'Hello world\n@text greeting = "Hi"\nMore text';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello world',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 11 }
          }
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            value: '"Hi"'
          },
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 21 }
          }
        },
        {
          type: 'Text',
          content: 'More text',
          location: {
            start: { line: 3, column: 1 },
            end: { line: 3, column: 9 }
          }
        }
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
      
      const result = await service.parse(content);
      expect(result[0]).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'invalid',
          value: 'xyz'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      });
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = '@text greeting = "unclosed string';
      
      const result = await service.parse(content);
      expect(result[0]).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: '"unclosed string'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 33 }
        }
      });
    });
  });

  describe('parseWithLocations', () => {
    it('should include file path in locations', async () => {
      const content = 'Hello\n@text greeting = "Hi"';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 5 }
          }
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            value: '"Hi"'
          },
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 21 }
          }
        }
      ];

      const filePath = 'test.meld';
      const resultWithFilePath = await service.parseWithLocations(content, filePath);
      expect(resultWithFilePath).toEqual(mockResult.map(node => ({
        ...node,
        location: node.location ? {
          ...node.location,
          filePath
        } : undefined
      })));

      const resultWithoutFilePath = await service.parseWithLocations(content);
      expect(resultWithoutFilePath).toEqual(mockResult);
    });

    it('should preserve original locations when adding filePath', async () => {
      const content = '@text greeting = "Hi"';
      const location = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 21 }
      };
      const filePath = 'test.meld';

      const result = await service.parseWithLocations(content, filePath);
      
      expect(result[0].location).toMatchObject({
        start: location.start,
        end: location.end,
        filePath
      });
    });

    it('should include filePath in error for invalid content', async () => {
      const content = '@invalid xyz';
      const filePath = 'test.meld';
      
      const result = await service.parseWithLocations(content, 'test.meld');
      expect(result[0]).toMatchObject({
        type: 'Directive',
        directive: {
          kind: 'invalid',
          value: 'xyz'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 },
          filePath
        }
      });
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