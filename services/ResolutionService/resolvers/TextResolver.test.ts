import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextResolver } from './TextResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

describe('TextResolver', () => {
  let resolver: TextResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getTextVar: vi.fn(),
      setTextVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new TextResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      }
    };
  });

  describe('resolve', () => {
    it('should return string without text variables unchanged', async () => {
      const result = await resolver.resolve('no variables here', context);
      expect(result).toBe('no variables here');
    });

    it('should resolve simple text variable', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue('value');
      const result = await resolver.resolve('${test}', context);
      expect(result).toBe('value');
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it('should resolve multiple text variables', async () => {
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('first')
        .mockReturnValueOnce('second');
      
      const result = await resolver.resolve('${one} and ${two}', context);
      expect(result).toBe('first and second');
      expect(stateService.getTextVar).toHaveBeenCalledWith('one');
      expect(stateService.getTextVar).toHaveBeenCalledWith('two');
    });

    it('should handle format specifications', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue('value');
      const result = await resolver.resolve('${test>>(format)}', context);
      expect(result).toBe('value'); // Format not implemented yet
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it('should handle environment variables', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve('${ENV_TEST}', context))
        .rejects
        .toThrow('Environment variable not set: ENV_TEST');
    });

    it('should handle variables in template literals', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue('world');
      const result = await resolver.resolve('`Hello ${name}!`', context);
      expect(result).toBe('`Hello world!`');
    });
  });

  describe('error handling', () => {
    it('should throw when text variables are not allowed', async () => {
      context.allowedVariableTypes.text = false;

      await expect(resolver.resolve('${test}', context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it('should throw on undefined variable', async () => {
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve('${missing}', context))
        .rejects
        .toThrow('Undefined text variable: missing');
    });

    it('should throw on nested variable interpolation', async () => {
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('inner')
        .mockReturnValueOnce('outer');
      
      await expect(resolver.resolve('${outer${inner}}', context))
        .rejects
        .toThrow('Nested variable interpolation is not allowed');
    });
  });

  describe('extractReferences', () => {
    it('should extract simple variable references', () => {
      const refs = resolver.extractReferences('${one} and ${two}');
      expect(refs).toEqual(['one', 'two']);
    });

    it('should extract variables with format specifications', () => {
      const refs = resolver.extractReferences('${test>>(format)}');
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for no references', () => {
      const refs = resolver.extractReferences('no references here');
      expect(refs).toEqual([]);
    });

    it('should handle repeated references', () => {
      const refs = resolver.extractReferences('${test} and ${test}');
      expect(refs).toEqual(['test', 'test']);
    });

    it('should only match valid variable names', () => {
      const refs = resolver.extractReferences('${valid} ${123invalid} ${_valid}');
      expect(refs).toEqual(['valid', '_valid']);
    });
  });
}); 