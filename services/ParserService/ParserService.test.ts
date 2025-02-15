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
      const content = '@text identifier="greeting" value="Hello"';
      const mockResult: MeldNode[] = [{
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 24 }
        }
      } as DirectiveNode];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should parse mixed content', async () => {
      const content = 'Hello world\n@text identifier="greeting" value="Hi"\nMore text';
      const mockResult: MeldNode[] = [{
        type: 'Text',
        content: 'Hello world',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 11 }
        }
      } as TextNode, {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hi'
        },
        location: {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 20 }
        }
      } as DirectiveNode, {
        type: 'Text',
        content: 'More text',
        location: {
          start: { line: 3, column: 1 },
          end: { line: 3, column: 9 }
        }
      } as TextNode];

      const result = await service.parse(content);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty content', async () => {
      await expect(service.parse('')).rejects.toThrow(MeldParseError);
      await expect(service.parse('')).rejects.toThrow('Parse error: Empty content provided');
    });

    it('should throw MeldParseError with location for invalid directive', async () => {
      const content = '@invalid xyz';
      const position = createPosition(1, 1);
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toThrow('Parse error: Invalid directive at line 1, column 1');
    });

    it('should throw MeldParseError for malformed directive', async () => {
      const content = '@text greeting = "unclosed string';
      const position = createPosition(1, 1);
      
      await expect(service.parse(content)).rejects.toThrow(MeldParseError);
      await expect(service.parse(content)).rejects.toMatchObject({
        message: expect.stringContaining('Unterminated string'),
        location: {
          start: position,
          end: position
        }
      });
    });
  });

  describe('parseWithLocations', () => {
    it('should include file path in locations', async () => {
      const content = 'Hello\n@text identifier="greeting" value="Hi"';
      const filePath = 'test.meld';
      const mockResult: MeldNode[] = [{
        type: 'Text',
        content: 'Hello',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 5 }
        }
      } as TextNode, {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hi'
        },
        location: {
          start: { line: 2, column: 1 },
          end: { line: 2, column: 20 }
        }
      } as DirectiveNode];

      const result = await service.parseWithLocations(content, filePath);
      
      // Verify that filePath is added to locations
      expect(result).toHaveLength(2);
      result.forEach(node => {
        expect(node.location).toBeDefined();
        if (node.location) {
          expect(node.location.start).toBeDefined();
          expect(node.location.end).toBeDefined();
          expect(node.location.start.line).toBeGreaterThan(0);
          expect(node.location.start.column).toBeGreaterThan(0);
          expect(node.location.end.line).toBeGreaterThan(0);
          expect(node.location.end.column).toBeGreaterThan(0);
          expect(hasFilePath(node.location)).toBe(true);
          if (hasFilePath(node.location)) {
            expect(node.location.filePath).toBe(filePath);
          }
        }
      });

      // Verify the rest of the node structure matches except for filePath
      const resultWithoutFilePath = result.map(node => ({
        ...node,
        location: node.location ? {
          start: node.location.start,
          end: node.location.end
        } : undefined
      }));
      expect(resultWithoutFilePath).toEqual(mockResult);
    });

    it('should preserve original locations when adding filePath', async () => {
      const content = '@text identifier="greeting" value="Hi"';
      const location = createTestLocation(1, 1, 1, 20);
      const filePath = 'test.meld';
      location.filePath = filePath;
      const mockResult: MeldNode[] = [{
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hi'
        },
        location
      } as DirectiveNode];

      const result = await service.parseWithLocations(content, filePath);
      
      expect(result[0].location).toMatchObject({
        start: location.start,
        end: location.end,
        filePath
      });
    });

    it('should include filePath in error for invalid content', async () => {
      const content = '@invalid xyz';
      const position = createPosition(1, 1);
      
      await expect(service.parseWithLocations(content, 'test.meld')).rejects.toMatchObject({
        message: expect.stringContaining('Invalid directive'),
        location: {
          start: position,
          end: position,
          filePath: 'test.meld'
        }
      });
    });

    it('should handle empty content with filePath', async () => {
      await expect(service.parseWithLocations('', 'test.meld')).rejects.toMatchObject({
        message: expect.stringContaining('Empty content provided'),
        location: expect.objectContaining({
          filePath: 'test.meld'
        })
      });
    });
  });

  describe('error handling', () => {
    it('should wrap unknown errors in MeldParseError', async () => {
      await expect(service.parse('content')).rejects.toThrow(MeldParseError);
      await expect(service.parse('content')).rejects.toThrow('Parse error: Unknown error');
    });

    it('should preserve MeldParseError instances', async () => {
      const position = createPosition(1, 1);
      const originalError = new MeldParseError('Test error', position);

      await expect(service.parse('content')).rejects.toThrow(originalError);
    });

    it('should convert ParseError to MeldParseError with location', async () => {
      const parseError = {
        message: 'Parse failed',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 5 }
        }
      };

      await expect(service.parse('content')).rejects.toMatchObject({
        message: expect.stringContaining('Parse failed'),
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 }
        }
      });
    });
  });
}); 