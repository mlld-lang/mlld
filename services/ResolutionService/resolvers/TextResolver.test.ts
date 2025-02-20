import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextResolver } from './TextResolver.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
import { MeldNode } from 'meld-spec';

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
    it('should return content of text node unchanged', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no variables here'
      };
      const result = await resolver.resolve(node, context);
      expect(result).toBe('no variables here');
    });

    it('should resolve text directive node', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue('resolved');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('resolved');
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it('should handle format specifications', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value',
          format: '(format)'
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue('value');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value'); // Format not implemented yet
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it.todo('should handle environment variables appropriately (pending new error system)');
  });

  describe('error handling', () => {
    it('should throw when text variables are not allowed', async () => {
      context.allowedVariableTypes.text = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it.todo('should handle undefined variables (pending new error system)');

    it('should throw on invalid node type', async () => {
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
        .toThrow('Invalid node type for text resolution');
    });

    it('should throw on missing variable name', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text'
        }
      };

      await expect(() => resolver.resolve(node, context))
        .rejects
        .toThrow('Text variable identifier is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract variable name from text directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-text directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
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