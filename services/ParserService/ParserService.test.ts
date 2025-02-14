import { describe, it, expect } from 'vitest';
import { ParserService } from './ParserService';
import { MeldParseError } from '../../core/errors/MeldParseError';

describe('ParserService', () => {
  let parser: ParserService;

  beforeEach(() => {
    parser = new ParserService();
  });

  describe('parse', () => {
    it('should parse simple text content', () => {
      const content = 'Hello world';
      const result = parser.parse(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'Text',
        content: 'Hello world'
      });
    });

    it('should parse directive content', () => {
      const content = '@data name="test" value="value"';
      const result = parser.parse(content);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'Directive',
        kind: 'data'
      });
    });

    it('should parse mixed content', () => {
      const content = `
        Hello world
        @text greeting = "Hi"
        More text
      `;
      const result = parser.parse(content);
      expect(result.length).toBeGreaterThan(1);
      expect(result.some(node => node.type === 'Text')).toBe(true);
      expect(result.some(node => node.type === 'Directive')).toBe(true);
    });

    it('should throw MeldParseError for invalid content', () => {
      const content = '@invalid-directive';
      expect(() => parser.parse(content)).toThrow(MeldParseError);
    });
  });

  describe('parseWithLocations', () => {
    it('should add location information to nodes', () => {
      const content = 'Hello\n@text greeting = "Hi"';
      const result = parser.parseWithLocations(content, 'test.meld');
      
      expect(result).toHaveLength(2);
      expect(result[0].location).toBeDefined();
      expect(result[1].location).toBeDefined();
      expect(result[0].location?.filePath).toBe('test.meld');
    });

    it('should handle single line content', () => {
      const content = '@text greeting = "Hi"';
      const result = parser.parseWithLocations(content);
      
      expect(result[0].location).toBeDefined();
      expect(result[0].location?.line).toBe(1);
      expect(result[0].location?.column).toBeDefined();
    });

    it('should handle multiline content', () => {
      const content = `
        First line
        @text greeting = "Hi"
        Third line
      `;
      const result = parser.parseWithLocations(content);
      
      expect(result.every(node => node.location?.line !== undefined)).toBe(true);
      expect(result.every(node => node.location?.column !== undefined)).toBe(true);
    });

    it('should include file path in error for invalid content', () => {
      const content = '@invalid-directive';
      try {
        parser.parseWithLocations(content, 'test.meld');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldParseError);
        if (error instanceof MeldParseError) {
          expect(error.location?.filePath).toBe('test.meld');
        }
      }
    });

    it('should preserve existing location information', () => {
      const content = '@text greeting = "Hi"';
      const existingLocation = { line: 1, column: 1 };
      const nodes = parser.parse(content);
      nodes[0].location = existingLocation;
      
      const result = parser.parseWithLocations(content, 'test.meld');
      expect(result[0].location).toMatchObject({
        ...existingLocation,
        filePath: 'test.meld'
      });
    });
  });
}); 