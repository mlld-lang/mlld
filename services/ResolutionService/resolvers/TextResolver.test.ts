import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextResolver } from './TextResolver';
import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
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
          name: 'test',
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
          name: 'test',
          value: 'value',
          format: '(format)'
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue('value');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value'); // Format not implemented yet
      expect(stateService.getTextVar).toHaveBeenCalledWith('test');
    });

    it('should handle environment variables', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'ENV_TEST',
          value: ''
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Environment variable not set: ENV_TEST');
    });
  });

  describe('error handling', () => {
    it('should throw when text variables are not allowed', async () => {
      context.allowedVariableTypes.text = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Text variables are not allowed in this context');
    });

    it('should throw on undefined variable', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'missing',
          value: ''
        }
      };
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Undefined text variable: missing');
    });

    it('should throw on invalid node type', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          name: 'test',
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
          kind: 'text',
          value: ''
        }
      };
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Text variable name is required');
    });
  });

  describe('extractReferences', () => {
    it('should extract variable name from text directive', () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
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
          name: 'test',
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