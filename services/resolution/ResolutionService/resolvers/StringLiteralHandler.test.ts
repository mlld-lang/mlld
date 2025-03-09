import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StringLiteralHandler } from './StringLiteralHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { createMockParserService, createDirectiveNode, createTextNode } from '@tests/utils/testFactories.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';

describe('StringLiteralHandler', () => {
  let handler: StringLiteralHandler;
  let parserService: ReturnType<typeof createMockParserService>;

  beforeEach(() => {
    parserService = createMockParserService();
    handler = new StringLiteralHandler(parserService);
    // Enable silent mode to avoid console error spam during tests
    handler.setSilentMode(true);
  });

  describe('isStringLiteral', () => {
    it('should detect string literals using AST when available', async () => {
      // Mock AST for string literal
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '"hello world"',
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst('"hello world"');
      expect(result).toBe(true);
      expect(parserService.parse).toHaveBeenCalled();
    });
    
    it('should fall back to regex when AST parsing fails', async () => {
      // Mock parser to throw an error
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      const result = await handler.isStringLiteralWithAst('"hello world"');
      expect(result).toBe(true);
      
      // Test the synchronous method as well
      expect(handler.isStringLiteral('"hello world"')).toBe(true);
    });
    
    it('should accept single quoted strings', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: "'hello world'",
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst("'hello world'");
      expect(result).toBe(true);
      
      // Test the synchronous method as well
      expect(handler.isStringLiteral("'hello world'")).toBe(true);
    });

    it('should accept double quoted strings', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '"hello world"',
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst('"hello world"');
      expect(result).toBe(true);
      
      // Test the synchronous method as well
      expect(handler.isStringLiteral('"hello world"')).toBe(true);
    });

    it('should accept backtick quoted strings', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '`hello world`',
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst('`hello world`');
      expect(result).toBe(true);
      
      // Test the synchronous method as well
      expect(handler.isStringLiteral('`hello world`')).toBe(true);
    });

    it('should reject unmatched quotes', async () => {
      // Mock parser to throw an error for invalid string
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      const result = await handler.isStringLiteralWithAst("'hello world");
      expect(result).toBe(false);
      
      // Test the synchronous method as well
      expect(handler.isStringLiteral("'hello world")).toBe(false);
    });
  });

  describe('validateLiteral', () => {
    it('should validate string literals using AST when available', async () => {
      // Mock AST for valid string literal
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '"hello world"',
          source: 'literal'
        })
      ]);
      
      await expect(handler.validateLiteralWithAst('"hello world"')).resolves.not.toThrow();
      expect(parserService.parse).toHaveBeenCalled();
    });
    
    it('should fall back to manual validation when AST parsing fails', async () => {
      // Mock parser to throw an error
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.validateLiteralWithAst('"hello world"')).resolves.not.toThrow();
      
      // Test the synchronous method as well
      expect(() => handler.validateLiteral('"hello world"')).not.toThrow();
    });
    
    it('should reject empty strings with AST', async () => {
      // Mock parser to throw an error for empty string
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.validateLiteralWithAst('""')).rejects.toThrow(ResolutionError);
      
      // Test the synchronous method as well
      expect(() => handler.validateLiteral('""')).toThrow(ResolutionError);
    });
    
    it('should reject strings without quotes with AST', async () => {
      // Mock parser to throw an error for non-quoted string
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.validateLiteralWithAst('hello world')).rejects.toThrow(ResolutionError);
      
      // Test the synchronous method as well
      expect(() => handler.validateLiteral('hello world')).toThrow(ResolutionError);
    });
  });

  describe('parseLiteral', () => {
    it('should parse string literals using AST when available', async () => {
      // Mock AST for string literal
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('"hello world"');
      expect(result).toBe('hello world');
      expect(parserService.parse).toHaveBeenCalled();
    });
    
    it('should fall back to manual parsing when AST parsing fails', async () => {
      // Mock parser to throw an error
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      const result = await handler.parseLiteralWithAst('"hello world"');
      expect(result).toBe('hello world');
      
      // Test the synchronous method as well
      expect(handler.parseLiteral('"hello world"')).toBe('hello world');
    });
    
    it('should remove matching single quotes with AST', async () => {
      // Mock AST for single-quoted string
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst("'hello world'");
      expect(result).toBe('hello world');
      
      // Test the synchronous method as well
      expect(handler.parseLiteral("'hello world'")).toBe('hello world');
    });
    
    it('should remove matching double quotes with AST', async () => {
      // Mock AST for double-quoted string
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('"hello world"');
      expect(result).toBe('hello world');
      
      // Test the synchronous method as well
      expect(handler.parseLiteral('"hello world"')).toBe('hello world');
    });
    
    it('should remove matching backticks with AST', async () => {
      // Mock AST for backtick-quoted string
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('`hello world`');
      expect(result).toBe('hello world');
      
      // Test the synchronous method as well
      expect(handler.parseLiteral('`hello world`')).toBe('hello world');
    });
    
    it('should preserve internal quotes with AST', async () => {
      // Mock AST for string with internal quotes
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'It\'s a test',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst("'It\\'s a test'");
      expect(result).toBe("It's a test");
      
      // Test the synchronous method as well
      expect(handler.parseLiteral("'It\\'s a test'")).toBe("It's a test");
    });
    
    it('should throw on invalid input with AST', async () => {
      // Mock parser to throw an error for invalid input
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.parseLiteralWithAst('invalid')).rejects.toThrow(ResolutionError);
      
      // Test the synchronous method as well
      expect(() => handler.parseLiteral('invalid')).toThrow(ResolutionError);
    });
  });
}); 