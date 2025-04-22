import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { createMockParserService, createDirectiveNode, createTextNode } from '@tests/utils/testFactories.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { container, DependencyContainer } from 'tsyringe';
import { mock } from 'vitest-mock-extended';
import type { IStateService } from '@services/state/StateService/IStateService.js';

describe('StringConcatenationHandler', () => {
  let testContainer: DependencyContainer;
  let handler: StringConcatenationHandler;
  let mockResolutionService: IResolutionService;
  let mockParserService: IParserService;
  let mockStateService: IStateService;
  let context: ResolutionContext;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    mockResolutionService = mock<IResolutionService>({
      resolveInContext: vi.fn()
    });
    mockParserService = mock<IParserService>({
      parse: vi.fn()
    });
    mockStateService = mock<IStateService>({
      getCurrentFilePath: vi.fn().mockReturnValue('test.meld') 
    });

    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<DependencyContainer>('DependencyContainer', testContainer);

    handler = new StringConcatenationHandler(mockResolutionService, mockParserService);

    context = {
      currentFilePath: 'test.meld',
      strict: true,
      allowedVariableTypes: new Set(['text', 'data', 'path', 'command']),
      state: mockStateService
    };

    vi.resetAllMocks();
  });
  
  afterEach(async () => {
    testContainer?.dispose();
  });

  describe('hasConcatenation', () => {
    it('should detect valid concatenation operators using AST', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
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
      vi.spyOn(mockParserService, 'parse').mockRejectedValue(new Error('Parse error'));

      expect(await handler.hasConcatenation('"hello" ++ "world"')).toBe(true);
      expect(await handler.hasConcatenation('"hello"++"world"')).toBe(false);
    });

    it('should reject invalid concatenation operators', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: '"hello"'
        })
      ]);

      expect(await handler.hasConcatenation('"hello" + + "world"')).toBe(false);
      expect(await handler.hasConcatenation('"hello" + "world"')).toBe(false);
    });
  });

  describe('resolveConcatenation', () => {
    it('should use AST parsing to split concatenation parts', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello"', '" "', '"world"'],
            raw: '"hello" ++ " " ++ "world"'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
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
      vi.spyOn(mockParserService, 'parse').mockRejectedValue(new Error('Parse error'));

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '"hello"') return 'hello';
        if (value === '" "') return ' ';
        if (value === '"world"') return 'world';
        return String(value);
      });

      const result = await handler.resolveConcatenation('"hello" ++ " " ++ "world"', context);
      expect(result).toBe('hello world');
    });

    it('should handle variables through resolution service', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['{{var1}}', '" "', '{{var2}}'],
            raw: '{{var1}} ++ " " ++ {{var2}}'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '{{var1}}') return 'hello';
        if (value === '{{var2}}') return 'world';
        if (value === '" "') return ' ';
        return value;
      });

      const result = await handler.resolveConcatenation('{{var1}} ++ " " ++ {{var2}}', context);
      expect(result).toBe('hello world');
    });

    it('should preserve whitespace in string literals', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"  hello  "', '"  world  "'],
            raw: '"  hello  " ++ "  world  "'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '"  hello  "') return '  hello  ';
        if (value === '"  world  "') return '  world  ';
        return value;
      });

      const result = await handler.resolveConcatenation('"  hello  " ++ "  world  "', context);
      expect(result).toBe('  hello    world  ');
    });

    it('should handle escaped quotes in string literals', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"say \\"hello\\""', '" world"'],
            raw: '"say \\"hello\\"" ++ " world"'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '"say \\"hello\\""') return 'say "hello"';
        if (value === '" world"') return ' world';
        return value;
      });

      const result = await handler.resolveConcatenation('"say \\"hello\\"" ++ " world"', context);
      expect(result).toBe('say "hello" world');
    });

    it('should handle mixed string literals and variables', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello "', '{{name}}'],
            raw: '"hello " ++ {{name}}'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '"hello "') return 'hello ';
        if (value === '{{name}}') return 'world';
        return value;
      });

      const result = await handler.resolveConcatenation('"hello " ++ {{name}}', context);
      expect(result).toBe('hello world');
    });

    it('should reject empty parts', async () => {
      vi.spyOn(mockParserService, 'parse').mockRejectedValue(new Error('Parse error'));

      await expect(handler.resolveConcatenation('"hello" ++  ++ "world"', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle resolution errors', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['"hello"', '{{missing}}'],
            raw: '"hello" ++ {{missing}}'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '"hello"') return 'hello';
        if (value === '{{missing}}') throw new ResolutionError('Variable not found', ResolutionErrorCode.VARIABLE_NOT_FOUND, { value: '{{missing}}' });
        return value;
      });

      await expect(handler.resolveConcatenation('"hello" ++ {{missing}}', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle backtick strings', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['`hello`', '` world`'],
            raw: '`hello` ++ ` world`'
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '`hello`') return 'hello';
        if (value === '` world`') return ' world';
        return value;
      });

      const result = await handler.resolveConcatenation('`hello` ++ ` world`', context);
      expect(result).toBe('hello world');
    });

    it('should handle single quoted strings', async () => {
      vi.spyOn(mockParserService, 'parse').mockResolvedValue([
        createDirectiveNode('text', {
          identifier: 'test',
          value: {
            type: 'Concatenation',
            parts: ['\'hello\'', '\' world\''],
            raw: '\'hello\' ++ \' world\''
          }
        })
      ]);

      vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value) => {
        if (value === '\'hello\'') return 'hello';
        if (value === '\' world\'') return ' world';
        return value;
      });

      const result = await handler.resolveConcatenation('\'hello\' ++ \' world\'', context);
      expect(result).toBe('hello world');
    });
  });
}); 