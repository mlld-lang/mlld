import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StringConcatenationHandler } from './StringConcatenationHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { createMockParserService, createDirectiveNode, createTextNode } from '@tests/utils/testFactories.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';

describe('StringConcatenationHandler', () => {
  let handler: StringConcatenationHandler;
  let mockResolutionService: IResolutionService;
  let mockParserService: ReturnType<typeof createMockParserService>;
  let context: ResolutionContext;

  beforeEach(() => {
    mockResolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    mockParserService = createMockParserService();
    handler = new StringConcatenationHandler(mockResolutionService, mockParserService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      state: {} as any
    };

    // Enable silent mode to avoid console error spam during tests
    handler.setSilentMode(true);
  });

  describe('hasConcatenation', () => {
    it('should detect valid concatenation operators using AST', async () => {
      // Mock the AST for concatenation syntax
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello"', '"world"']
          }
        })
      ]);

      expect(await handler.hasConcatenation('"hello" ++ "world"')).toBe(true);
      expect(mockParserService.parse).toHaveBeenCalled();
    });

    it('should fall back to regex detection when AST parsing fails', async () => {
      // Mock parser to throw an error
      vi.mocked(mockParserService.parse).mockRejectedValue(new Error('Parse error'));

      expect(await handler.hasConcatenation('"hello" ++ "world"')).toBe(true);
      expect(await handler.hasConcatenation('"hello"++"world"')).toBe(false); // No spaces
    });

    it('should reject invalid concatenation operators', async () => {
      // Mock the AST without concatenation
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: '"hello"'
        })
      ]);

      expect(await handler.hasConcatenation('"hello" + + "world"')).toBe(false); // Split ++
      expect(await handler.hasConcatenation('"hello" + "world"')).toBe(false); // Single +
    });
  });

  describe('resolveConcatenation', () => {
    it('should use AST parsing to split concatenation parts', async () => {
      // Mock the AST for concatenation
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello"', '" "', '"world"'],
            raw: '"hello" ++ " " ++ "world"'
          }
        })
      ]);

      // Mock resolution service
      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '"hello"') return 'hello';
        if (value === '" "') return ' ';
        if (value === '"world"') return 'world';
        return String(value);
      });

      const result = await handler.resolveConcatenation('"hello" ++ " " ++ "world"', context);
      expect(result).toBe('hello world');
      expect(mockParserService.parse).toHaveBeenCalled();
    });

    it('should fall back to regex-based splitting when AST parsing fails', async () => {
      // Mock parser to throw an error
      vi.mocked(mockParserService.parse).mockRejectedValue(new Error('Parse error'));

      // Mock resolution service
      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '"hello"') return 'hello';
        if (value === '" "') return ' ';
        if (value === '"world"') return 'world';
        return String(value);
      });

      const result = await handler.resolveConcatenation('"hello" ++ " " ++ "world"', context);
      expect(result).toBe('hello world');
    });

    it('should handle variables through resolution service', async () => {
      // Mock the AST with variable references in concatenation
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['{{var1}}', '" "', '{{var2}}'],
            raw: '{{var1}} ++ " " ++ {{var2}}'
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '{{var1}}') return 'hello';
        if (value === '{{var2}}') return 'world';
        if (value === '" "') return ' ';
        return value;
      });

      const result = await handler.resolveConcatenation('{{var1}} ++ " " ++ {{var2}}', context);
      expect(result).toBe('hello world');
    });

    it('should preserve whitespace in string literals', async () => {
      // Mock AST with whitespace in string literals
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"  hello  "', '"  world  "'],
            raw: '"  hello  " ++ "  world  "'
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '"  hello  "') return '  hello  ';
        if (value === '"  world  "') return '  world  ';
        return value;
      });

      const result = await handler.resolveConcatenation('"  hello  " ++ "  world  "', context);
      expect(result).toBe('  hello    world  ');
    });

    it('should handle escaped quotes in string literals', async () => {
      // Mock AST with escaped quotes
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"say \\"hello\\""', '" world"'],
            raw: '"say \\"hello\\"" ++ " world"'
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '"say \\"hello\\""') return 'say "hello"';
        if (value === '" world"') return ' world';
        return value;
      });

      const result = await handler.resolveConcatenation('"say \\"hello\\"" ++ " world"', context);
      expect(result).toBe('say "hello" world');
    });

    it('should handle mixed string literals and variables', async () => {
      // Mock AST with mixed string literals and variables
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello "', '{{name}}'],
            raw: '"hello " ++ {{name}}'
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '"hello "') return 'hello ';
        if (value === '{{name}}') return 'world';
        return value;
      });

      const result = await handler.resolveConcatenation('"hello " ++ {{name}}', context);
      expect(result).toBe('hello world');
    });

    it('should reject empty parts', async () => {
      // Mock AST with invalid concatenation (empty part)
      vi.mocked(mockParserService.parse).mockRejectedValue(new Error('Parse error'));

      await expect(handler.resolveConcatenation('"hello" ++  ++ "world"', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle resolution errors', async () => {
      // Mock AST with valid concatenation
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello"', '{{missing}}'],
            raw: '"hello" ++ {{missing}}'
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '"hello"') return 'hello';
        if (value === '{{missing}}') throw new ResolutionError('Variable not found', ResolutionErrorCode.VARIABLE_NOT_FOUND, { value: '{{missing}}' });
        return value;
      });

      await expect(handler.resolveConcatenation('"hello" ++ {{missing}}', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle backtick strings', async () => {
      // Mock AST with backtick strings
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['`hello`', '` world`'],
            raw: '`hello` ++ ` world`'
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '`hello`') return 'hello';
        if (value === '` world`') return ' world';
        return value;
      });

      const result = await handler.resolveConcatenation('`hello` ++ ` world`', context);
      expect(result).toBe('hello world');
    });

    it('should handle single quoted strings', async () => {
      // Mock AST with single quoted strings
      vi.mocked(mockParserService.parse).mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ["'hello'", "' world'"],
            raw: "'hello' ++ ' world'"
          }
        })
      ]);

      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === "'hello'") return 'hello';
        if (value === "' world'") return ' world';
        return value;
      });

      const result = await handler.resolveConcatenation("'hello' ++ ' world'", context);
      expect(result).toBe('hello world');
    });
  });
}); 