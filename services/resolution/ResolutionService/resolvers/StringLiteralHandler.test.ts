import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { createMockParserService, createDirectiveNode, createTextNode } from '@tests/utils/testFactories.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { mockDeep, type MockedObjectDeep } from 'vitest-mock-extended';
import { container, type DependencyContainer } from 'tsyringe';

describe('StringLiteralHandler', () => {
  let testContainer: DependencyContainer;
  let handler: StringLiteralHandler;
  let parserService: MockedObjectDeep<IParserService>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    
    parserService = {
      parseString: vi.fn(),
      parseFile: vi.fn(),
      parse: vi.fn(),
      parseWithLocations: vi.fn()
    };
    testContainer.registerInstance<IParserService>('IParserService', parserService as IParserService);
    
    handler = new StringLiteralHandler(parserService as IParserService);
    
    vi.resetAllMocks();
  });
  
  afterEach(async () => {
    testContainer?.dispose();
  });

  describe('isStringLiteral', () => {
    it('should detect string literals using AST when available', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
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
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      const result = await handler.isStringLiteralWithAst('"hello world"');
      expect(result).toBe(true);
      
      expect(handler.isStringLiteral('"hello world"')).toBe(true);
    });
    
    it('should accept single quoted strings', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '\'hello world\'',
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst('\'hello world\'');
      expect(result).toBe(true);
      
      expect(handler.isStringLiteral('\'hello world\'')).toBe(true);
    });

    it('should accept double quoted strings', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '"hello world"',
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst('"hello world"');
      expect(result).toBe(true);
      
      expect(handler.isStringLiteral('"hello world"')).toBe(true);
    });

    it('should accept backtick quoted strings', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: '`hello world`',
          source: 'literal'
        })
      ]);
      
      const result = await handler.isStringLiteralWithAst('`hello world`');
      expect(result).toBe(true);
      
      expect(handler.isStringLiteral('`hello world`')).toBe(true);
    });

    it('should reject unmatched quotes', async () => {
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      const result = await handler.isStringLiteralWithAst('\'hello world');
      expect(result).toBe(false);
      
      expect(handler.isStringLiteral('\'hello world')).toBe(false);
    });
  });

  describe('validateLiteral', () => {
    it('should validate string literals using AST when available', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
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
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.validateLiteralWithAst('"hello world"')).resolves.not.toThrow();
      
      expect(() => handler.validateLiteral('"hello world"')).not.toThrow();
    });
    
    it('should reject empty strings with AST', async () => {
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.validateLiteralWithAst('""')).rejects.toThrow(ResolutionError);
      
      expect(() => handler.validateLiteral('""')).toThrow(ResolutionError);
    });
    
    it('should reject strings without quotes with AST', async () => {
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.validateLiteralWithAst('hello world')).rejects.toThrow(ResolutionError);
      
      expect(() => handler.validateLiteral('hello world')).toThrow(ResolutionError);
    });
  });

  describe('parseLiteral', () => {
    it('should parse string literals using AST when available', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
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
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      const result = await handler.parseLiteralWithAst('"hello world"');
      expect(result).toBe('hello world');
      
      expect(handler.parseLiteral('"hello world"')).toBe('hello world');
    });
    
    it('should remove matching single quotes with AST', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('\'hello world\'');
      expect(result).toBe('hello world');
      
      expect(handler.parseLiteral('\'hello world\'')).toBe('hello world');
    });
    
    it('should remove matching double quotes with AST', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('"hello world"');
      expect(result).toBe('hello world');
      
      expect(handler.parseLiteral('"hello world"')).toBe('hello world');
    });
    
    it('should remove matching backticks with AST', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'hello world',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('`hello world`');
      expect(result).toBe('hello world');
      
      expect(handler.parseLiteral('`hello world`')).toBe('hello world');
    });
    
    it('should preserve internal quotes with AST', async () => {
      vi.spyOn(parserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', { 
          identifier: 'test', 
          value: 'It\'s a test',
          source: 'literal'
        })
      ]);
      
      const result = await handler.parseLiteralWithAst('\'It\\\'s a test\'');
      expect(result).toBe('It\'s a test');
      
      expect(handler.parseLiteral('\'It\\\'s a test\'')).toBe('It\'s a test');
    });
    
    it('should throw on invalid input with AST', async () => {
      vi.spyOn(parserService, 'parse').mockRejectedValue(new Error('Parse error'));
      
      await expect(handler.parseLiteralWithAst('invalid')).rejects.toThrow(ResolutionError);
      
      expect(() => handler.parseLiteral('invalid')).toThrow(ResolutionError);
    });
  });
}); 