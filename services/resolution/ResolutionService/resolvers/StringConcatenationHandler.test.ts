import { describe, it, expect, beforeEach } from 'vitest';
import { StringConcatenationHandler } from './StringConcatenationHandler.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('StringConcatenationHandler', () => {
  let handler: StringConcatenationHandler;
  let mockResolutionService: IResolutionService;
  let context: ResolutionContext;

  beforeEach(() => {
    mockResolutionService = {
      resolveInContext: vi.fn()
    } as unknown as IResolutionService;

    handler = new StringConcatenationHandler(mockResolutionService);

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
  });

  describe('hasConcatenation', () => {
    it('should detect valid concatenation operators', () => {
      expect(handler.hasConcatenation('"hello" ++ "world"')).toBe(true);
      expect(handler.hasConcatenation('${var1} ++ ${var2}')).toBe(true);
      expect(handler.hasConcatenation('"prefix" ++ @embed [file.md]')).toBe(true);
    });

    it('should reject invalid concatenation operators', () => {
      expect(handler.hasConcatenation('"hello"++"world"')).toBe(false); // No spaces
      expect(handler.hasConcatenation('"hello" + + "world"')).toBe(false); // Split ++
      expect(handler.hasConcatenation('"hello" + "world"')).toBe(false); // Single +
    });
  });

  describe('resolveConcatenation', () => {
    it('should concatenate string literals', async () => {
      const result = await handler.resolveConcatenation('"hello" ++ " " ++ "world"', context);
      expect(result).toBe('hello world');
    });

    it('should handle variables through resolution service', async () => {
      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '${var1}') return 'hello';
        if (value === '${var2}') return 'world';
        return value;
      });

      const result = await handler.resolveConcatenation('${var1} ++ " " ++ ${var2}', context);
      expect(result).toBe('hello world');
    });

    it('should preserve whitespace in string literals', async () => {
      const result = await handler.resolveConcatenation('"  hello  " ++ "  world  "', context);
      expect(result).toBe('  hello    world  ');
    });

    it('should handle escaped quotes in string literals', async () => {
      const result = await handler.resolveConcatenation('"say \\"hello\\"" ++ " world"', context);
      expect(result).toBe('say "hello" world');
    });

    it('should handle mixed string literals and variables', async () => {
      vi.mocked(mockResolutionService.resolveInContext).mockImplementation(async (value) => {
        if (value === '${name}') return 'world';
        return value;
      });

      const result = await handler.resolveConcatenation('"hello " ++ ${name}', context);
      expect(result).toBe('hello world');
    });

    it('should reject empty parts', async () => {
      await expect(handler.resolveConcatenation('"hello" ++  ++ "world"', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle resolution errors', async () => {
      vi.mocked(mockResolutionService.resolveInContext).mockRejectedValue(
        new ResolutionError('Variable not found', { value: '${missing}' })
      );

      await expect(handler.resolveConcatenation('"hello" ++ ${missing}', context))
        .rejects
        .toThrow(ResolutionError);
    });

    it('should handle backtick strings', async () => {
      const result = await handler.resolveConcatenation('`hello` ++ ` world`', context);
      expect(result).toBe('hello world');
    });

    it('should handle single quoted strings', async () => {
      const result = await handler.resolveConcatenation("'hello' ++ ' world'", context);
      expect(result).toBe('hello world');
    });
  });
}); 