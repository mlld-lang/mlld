import { describe, it, expect, beforeEach } from 'vitest';
import { ParserService } from './ParserService.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode } from 'meld-spec';
import type { Location, Position } from '@core/types/index.js';

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
      const mockResult = [{
        type: 'Text',
        content: 'Hello world',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      }];

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
        location: {
          start: { line: 1, column: 2 },
          end: { line: 1, column: 25 }
        }
      }];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse code fence content', async () => {
      const content = '```typescript\nconst x = 42;\nconsole.log(x);\n```';
      const result = await service.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).language).toBe('typescript');
      expect((result[0] as CodeFenceNode).content).toBe('```typescript\nconst x = 42;\nconsole.log(x);\n```');
    });

    it('should parse code fence without language', async () => {
      const content = '```\nplain text\n```';
      const result = await service.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).language).toBeUndefined();
      expect((result[0] as CodeFenceNode).content).toBe('```\nplain text\n```');
    });

    it('should preserve whitespace in code fences', async () => {
      const content = '```\n  indented\n    more indented\n```';
      const result = await service.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\n  indented\n    more indented\n```');
    });

    it('should treat directives as literal text in code fences', async () => {
      const content = '```\n@text greeting = "Hello"\n@run [echo test]\n```';
      const result = await service.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\n@text greeting = "Hello"\n@run [echo test]\n```');
    });

    it('should handle nested code fences', async () => {
      const content = '````\nouter\n```\ninner\n```\n````';
      const result = await service.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('````\nouter\n```\ninner\n```\n````');
    });

    it('should parse code fences with equal backtick counts', async () => {
      const content = '```\nouter\n```\ninner\n```\n```';
      const result = await service.parse(content);
      
      expect(result).toHaveLength(5);
      expect(result[0].type).toBe('CodeFence');
      expect((result[0] as CodeFenceNode).content).toBe('```\nouter\n```');
      expect(result[1].type).toBe('Text');
      expect((result[1] as TextNode).content).toBe('inner\n');
      expect(result[2].type).toBe('Text');
      expect((result[2] as TextNode).content).toBe('```');
      expect(result[3].type).toBe('Text');
      expect((result[3] as TextNode).content).toBe('\n');
      expect(result[4].type).toBe('Text');
      expect((result[4] as TextNode).content).toBe('```');
    });

    it('should parse mixed content', async () => {
      const content = 'Hello world\n@text greeting = "Hi"\nMore text';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello world\n',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 2, column: 1 }
          }
        },
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hi'
          },
          location: {
            start: { line: 2, column: 2 },
            end: { line: 2, column: 22 }
          }
        },
        {
          type: 'Text',
          content: '\nMore text',
          location: {
            start: { line: 2, column: 22 },
            end: { line: 3, column: 10 }
          }
        }
      ];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty content', async () => {
      const result = await service.parse('');
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should throw MeldParseError with location for invalid directive', async () => {
      const content = '@invalid xyz';
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Parse error: Expected "data", "define", "embed", "import", "path", "run", "text", or "var" but "i" found.');
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = '@text greeting = "unclosed string';
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Parse error: Expected "\\"" or any character but end of input found.');
    });
  });

  describe('parseWithLocations', () => {
    it('should include file path in locations', async () => {
      const content = 'Hello\n@text greeting = "Hi"';
      const mockResult = [
        {
          type: 'Text',
          content: 'Hello\n',
          location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 }, filePath: 'test.meld' }
        } as unknown as TextNode,
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'greeting',
            source: 'literal',
            value: 'Hi'
          },
          location: { start: { line: 2, column: 2 }, end: { line: 2, column: 22 }, filePath: 'test.meld' }
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
      
      expect(result[0].location).toEqual({
        start: { line: 1, column: 2 },
        end: { line: 1, column: 22 },
        filePath
      });
    });

    it('should include filePath in error for invalid content', async () => {
      const content = '@invalid xyz';
      const filePath = 'test.meld';
      
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow(MeldParseError);
      await expect(service.parseWithLocations(content, filePath)).rejects.toThrow('Parse error: Parse error: Expected "data", "define", "embed", "import", "path", "run", "text", or "var" but "i" found.');
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
          end: { line: 1, column: 8 }
        }
      }]);
    });

    it('should preserve MeldParseError instances', async () => {
      const content = '@invalid';
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
    });
  });
}); 