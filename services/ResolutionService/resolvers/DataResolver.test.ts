import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataResolver } from './DataResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import { MeldNode } from 'meld-spec';

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
      const node: MeldNode = {
        type: 'Text',
        content: 'no variables here'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('no variables here');
    });

    it('should resolve data directive node', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'test',
          value: 'value'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue('resolved');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('resolved');
      expect(stateService.getDataVar).toHaveBeenCalledWith('test');
    });

    it('should resolve nested object fields', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'data',
          fields: 'nested.field'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue({
        nested: {
          field: 'value'
        }
      });
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should convert objects to JSON strings', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'data'
        }
      };
      const obj = { key: 'value' };
      vi.mocked(stateService.getDataVar).mockReturnValue(obj);
      const result = await resolver.resolve(node, context);
      expect(result).toBe(JSON.stringify(obj));
    });

    it('should handle null values', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'null'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue(null);
      const result = await resolver.resolve(node, context);
      expect(result).toBe('');
    });
  });

  describe('error handling', () => {
    it('should throw when data variables are not allowed', async () => {
      context.allowedVariableTypes.data = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'test'
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should throw on undefined variable', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'missing'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Undefined data variable: missing');
    });

    it('should throw on field access when not allowed', async () => {
      context.allowDataFields = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'data',
          fields: 'field'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue({ field: 'value' });
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Field access is not allowed in this context');
    });

    it('should throw on accessing field of null/undefined', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'data',
          fields: 'field'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue(null);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Cannot access field 'field' of undefined or null");
    });

    it('should throw on accessing field of non-object', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'data',
          fields: 'field'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue('string');
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Cannot access field 'field' of non-object value");
    });

    it('should throw on accessing non-existent field', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'data',
          fields: 'missing'
        }
      };
      vi.mocked(stateService.getDataVar).mockReturnValue({ other: 'value' });
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Field not found: missing in data.missing');
    });

    it('should throw on invalid node type', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test'
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Invalid node type for data resolution');
    });

    it('should throw on missing variable name', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data'
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Data variable name is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract variable name from data directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'test'
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-data directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test'
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
}); 