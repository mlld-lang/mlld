import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataResolver } from './DataResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

describe('DataResolver', () => {
  let resolver: DataResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getDataVar: vi.fn(),
      setDataVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new DataResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowDataFields: true
    };
  });

  describe('resolve', () => {
    it('should return string without data variables unchanged', async () => {
      const result = await resolver.resolve('no variables here', context);
      expect(result).toBe('no variables here');
    });

    it('should resolve simple data variable', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue('value');
      const result = await resolver.resolve('#{test}', context);
      expect(result).toBe('value');
      expect(stateService.getDataVar).toHaveBeenCalledWith('test');
    });

    it('should resolve multiple data variables', async () => {
      vi.mocked(stateService.getDataVar)
        .mockReturnValueOnce('first')
        .mockReturnValueOnce('second');
      
      const result = await resolver.resolve('#{one} and #{two}', context);
      expect(result).toBe('first and second');
      expect(stateService.getDataVar).toHaveBeenCalledWith('one');
      expect(stateService.getDataVar).toHaveBeenCalledWith('two');
    });

    it('should resolve nested object fields', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue({
        nested: {
          field: 'value'
        }
      });
      
      const result = await resolver.resolve('#{data.nested.field}', context);
      expect(result).toBe('value');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should convert objects to JSON strings', async () => {
      const obj = { key: 'value' };
      vi.mocked(stateService.getDataVar).mockReturnValue(obj);
      
      const result = await resolver.resolve('#{data}', context);
      expect(result).toBe(JSON.stringify(obj));
    });

    it('should handle null values', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue(null);
      
      const result = await resolver.resolve('#{null}', context);
      expect(result).toBe('');
    });
  });

  describe('error handling', () => {
    it('should throw on undefined variable', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve('#{missing}', context))
        .rejects
        .toThrow('Undefined data variable: missing');
    });

    it('should throw on field access when not allowed', async () => {
      context.allowDataFields = false;
      vi.mocked(stateService.getDataVar).mockReturnValue({ field: 'value' });
      
      await expect(resolver.resolve('#{data.field}', context))
        .rejects
        .toThrow('Field access is not allowed in this context');
    });

    it('should throw on accessing field of null/undefined', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue(null);
      
      await expect(resolver.resolve('#{data.field}', context))
        .rejects
        .toThrow("Cannot access field 'field' of undefined or null");
    });

    it('should throw on accessing field of non-object', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue('string');
      
      await expect(resolver.resolve('#{data.field}', context))
        .rejects
        .toThrow("Cannot access field 'field' of non-object value");
    });

    it('should throw on accessing non-existent field', async () => {
      vi.mocked(stateService.getDataVar).mockReturnValue({ other: 'value' });
      
      await expect(resolver.resolve('#{data.missing}', context))
        .rejects
        .toThrow('Field not found: missing in data.missing');
    });
  });

  describe('extractReferences', () => {
    it('should extract simple variable references', () => {
      const refs = resolver.extractReferences('#{one} and #{two}');
      expect(refs).toEqual(['one', 'two']);
    });

    it('should extract only base variable names from field access', () => {
      const refs = resolver.extractReferences('#{data.nested.field}');
      expect(refs).toEqual(['data']);
    });

    it('should return empty array for no references', () => {
      const refs = resolver.extractReferences('no references here');
      expect(refs).toEqual([]);
    });

    it('should handle repeated references', () => {
      const refs = resolver.extractReferences('#{data} and #{data}');
      expect(refs).toEqual(['data', 'data']);
    });
  });
}); 