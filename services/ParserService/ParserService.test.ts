import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParserService } from './ParserService';
import { MeldParseError } from '../../core/errors/MeldParseError';
import type { MeldNode } from 'meld-spec';
import type { Location, Position } from '../../core/types';
import { createLocation, createPosition } from '../../tests/utils/testFactories';

describe('ParserService', () => {
  let parser: ParserService;
  let parseSpy: any; // TODO: Fix type when vitest types are updated

  beforeEach(() => {
    parser = new ParserService();
    // @ts-ignore - access private method for testing
    parseSpy = vi.spyOn(parser, 'parseContent');
  });

  describe('parse', () => {
    it('should handle empty content', async () => {
      await expect(parser.parse('')).rejects.toThrow(MeldParseError);
      await expect(parser.parse('')).rejects.toThrow('Parse error: Empty content provided');
    });

    it('should parse simple text content', async () => {
      const content = 'Hello world';
      const mockResult: MeldNode[] = [{
        type: 'Text',
        content: 'Hello world',
        location: createLocation(1, 1, 1, 11)
      }];

      parseSpy.mockResolvedValue(mockResult);
      const result = await parser.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockResult[0]);
    });

    it('should parse directive content', async () => {
      const content = '@text greeting = "Hello"';
      const mockResult: MeldNode[] = [{
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        },
        location: createLocation(1, 1, 1, 24)
      }];

      parseSpy.mockResolvedValue(mockResult);
      const result = await parser.parse(content);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(mockResult[0]);
    });

    it('should parse mixed content with correct locations', async () => {
      const content = `
        Hello world
        @text greeting = "Hi"
        More text
      `.trim();
      
      const mockResult: MeldNode[] = [{
        type: 'Text',
        content: 'Hello world',
        location: createLocation(1, 1, 1, 11)
      }, {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hi'
        },
        location: createLocation(2, 1, 2, 20)
      }, {
        type: 'Text',
        content: 'More text',
        location: createLocation(3, 1, 3, 9)
      }];

      parseSpy.mockResolvedValue(mockResult);
      const result = await parser.parse(content);
      
      expect(result).toHaveLength(3);
      expect(result).toMatchObject(mockResult);
    });

    it('should throw MeldParseError with location for invalid directive', async () => {
      const content = '@invalid xyz';
      const position = createPosition(1, 1);
      
      parseSpy.mockRejectedValue(new MeldParseError('Invalid directive', position));
      
      await expect(parser.parse(content)).rejects.toThrow(MeldParseError);
      await expect(parser.parse(content)).rejects.toThrow('Parse error: Invalid directive at line 1, column 1');
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = '@text greeting = "unclosed string';
      const position = createPosition(1, 1);
      
      parseSpy.mockRejectedValue(new MeldParseError('Unterminated string', position));
      
      await expect(parser.parse(content)).rejects.toThrow(MeldParseError);
      await expect(parser.parse(content)).rejects.toMatchObject({
        message: expect.stringContaining('Unterminated string'),
        location: {
          start: position,
          end: position
        }
      });
    });
  });

  describe('parseWithLocations', () => {
    it('should add filePath to existing locations', async () => {
      const content = 'Hello\n@text greeting = "Hi"';
      const mockResult: MeldNode[] = [{
        type: 'Text',
        content: 'Hello',
        location: createLocation(1, 1, 1, 5)
      }, {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hi'
        },
        location: createLocation(2, 1, 2, 20)
      }];

      parseSpy.mockResolvedValue(mockResult);
      const result = await parser.parseWithLocations(content, 'test.meld');
      
      expect(result).toHaveLength(2);
      
      // Both nodes should have locations with filePath
      for (const node of result) {
        expect(node.location).toBeDefined();
        expect(node.location?.filePath).toBe('test.meld');
        // Original location info should be preserved
        expect(node.location?.start).toEqual(expect.objectContaining({
          line: expect.any(Number),
          column: expect.any(Number)
        }));
        expect(node.location?.end).toEqual(expect.objectContaining({
          line: expect.any(Number),
          column: expect.any(Number)
        }));
      }
    });

    it('should preserve original locations when adding filePath', async () => {
      const content = '@text greeting = "Hi"';
      const location = createLocation(1, 1, 1, 20);
      const mockResult: MeldNode[] = [{
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hi'
        },
        location
      }];

      parseSpy.mockResolvedValue(mockResult);
      const result = await parser.parseWithLocations(content, 'test.meld');
      
      expect(result[0].location).toMatchObject({
        start: location.start,
        end: location.end,
        filePath: 'test.meld'
      });
    });

    it('should include filePath in error for invalid content', async () => {
      const content = '@invalid xyz';
      const position = createPosition(1, 1);
      
      parseSpy.mockRejectedValue(new MeldParseError('Invalid directive', position));
      
      await expect(parser.parseWithLocations(content, 'test.meld')).rejects.toMatchObject({
        message: expect.stringContaining('Invalid directive'),
        location: {
          start: position,
          end: position,
          filePath: 'test.meld'
        }
      });
    });

    it('should handle empty content with filePath', async () => {
      await expect(parser.parseWithLocations('', 'test.meld')).rejects.toMatchObject({
        message: expect.stringContaining('Empty content provided'),
        location: expect.objectContaining({
          filePath: 'test.meld'
        })
      });
    });
  });

  describe('error handling', () => {
    it('should wrap unknown errors in MeldParseError', async () => {
      parseSpy.mockRejectedValue(new Error('Unknown error'));
      await expect(parser.parse('content')).rejects.toThrow(MeldParseError);
      await expect(parser.parse('content')).rejects.toThrow('Parse error: Unknown error');
    });

    it('should preserve MeldParseError instances', async () => {
      const position = createPosition(1, 1);
      const originalError = new MeldParseError('Test error', position);

      parseSpy.mockRejectedValue(originalError);
      await expect(parser.parse('content')).rejects.toThrow(originalError);
    });

    it('should convert ParseError to MeldParseError with location', async () => {
      const parseError = {
        message: 'Parse failed',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 5 }
        }
      };

      parseSpy.mockRejectedValue(parseError);
      await expect(parser.parse('content')).rejects.toMatchObject({
        message: expect.stringContaining('Parse failed'),
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 }
        }
      });
    });
  });
}); 