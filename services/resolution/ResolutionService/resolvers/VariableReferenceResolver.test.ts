import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableReferenceResolver } from './VariableReferenceResolver.js';
import { createMockStateService } from '@tests/utils/testFactories.js';
import { ResolutionError, ResolutionErrorCode } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';

describe('VariableReferenceResolver', () => {
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    resolver = new VariableReferenceResolver(stateService);
    context = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: 'test.meld'
    };
  });

  describe('resolve', () => {
    it('should resolve text variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');
      const result = await resolver.resolve('{{greeting}}', context);
      expect(result).toBe('Hello World');
      expect(stateService.getTextVar).toHaveBeenCalledWith('greeting');
    });

    it('should resolve data variables when text variable not found', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue('Data Value');
      const result = await resolver.resolve('{{data}}', context);
      expect(result).toBe('Data Value');
      expect(stateService.getTextVar).toHaveBeenCalledWith('data');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should handle multiple variable references', async () => {
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Hello')
        .mockReturnValueOnce('World');
      const result = await resolver.resolve('{{greeting1}} {{greeting2}}!', context);
      expect(result).toBe('Hello World!');
    });

    it('should handle field access in data variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue({ user: { name: 'Alice' } });
      const result = await resolver.resolve('{{data.user.name}}', context);
      expect(result).toBe('Alice');
    });

    it('should handle environment variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      await expect(resolver.resolve('{{ENV_TEST}}', context))
        .rejects
        .toThrow('Environment variable not set: ENV_TEST');
    });

    it('should throw on undefined variable', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      await expect(resolver.resolve('{{missing}}', context))
        .rejects
        .toThrow('Undefined variable: missing');
    });

    it('should preserve text without variables', async () => {
      const result = await resolver.resolve('No variables here', context);
      expect(result).toBe('No variables here');
      expect(stateService.getTextVar).not.toHaveBeenCalled();
    });

    it('should handle mixed content with variables', async () => {
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Alice')
        .mockReturnValueOnce('Wonderland');
      const result = await resolver.resolve(
        'Hello {{name}}, welcome to {{place}}!',
        context
      );
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });
  });

  describe('extractReferences', () => {
    it('should extract all variable references', () => {
      const refs = resolver.extractReferences('{{var1}} and {{var2}} and {{var3}}');
      expect(refs).toEqual(['var1', 'var2', 'var3']);
    });

    it('should handle field access in references', () => {
      const refs = resolver.extractReferences('{{data.field1}} and {{data.field2}}');
      expect(refs).toEqual(['data']);
    });

    it('should return empty array for no references', () => {
      const refs = resolver.extractReferences('No variables here');
      expect(refs).toEqual([]);
    });

    it('should handle duplicate references', () => {
      const refs = resolver.extractReferences('{{var1}} and {{var1}} and {{var1}}');
      expect(refs).toEqual(['var1']);
    });
  });
}); 