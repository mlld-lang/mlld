import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataResolver } from './DataResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode } from 'meld-spec';
import { createTestText, createTestDirective } from '@tests/utils/nodeFactories.js';

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
    it('should return content of text node unchanged', async () => {
      const node = createTestText('test');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('test');
    });

    it('should resolve data directive node', async () => {
      const node = createTestDirective('data', 'data', 'value');
      stateService.getDataVar.mockResolvedValue('value');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should convert objects to JSON strings', async () => {
      const node = createTestDirective('data', 'data', '{ "test": "value" }');
      stateService.getDataVar.mockResolvedValue({ test: 'value' });
      const result = await resolver.resolve(node, context);
      expect(result).toBe('{"test":"value"}');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should handle null values', async () => {
      const node = createTestDirective('data', 'data', 'null');
      stateService.getDataVar.mockResolvedValue(null);
      const result = await resolver.resolve(node, context);
      expect(result).toBe('null');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });
  });

  describe('error handling', () => {
    it('should throw when data variables are not allowed', async () => {
      context.allowedVariableTypes.data = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it.todo('should handle undefined variables appropriately (pending new error system)');

    it.todo('should handle field access restrictions appropriately (pending new error system)');

    it.todo('should handle null/undefined field access appropriately (pending new error system)');

    it.todo('should handle accessing field of non-object (pending new error system)');

    it.todo('should handle accessing non-existent field (pending new error system)');
  });

  describe('extractReferences', () => {
    it('should extract variable identifier from data directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-data directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
}); 