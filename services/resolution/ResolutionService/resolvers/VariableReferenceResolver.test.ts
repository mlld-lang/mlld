import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VariableReferenceResolver } from './VariableReferenceResolver.js';
import { createMockStateService, createMockParserService, createTextNode, createDirectiveNode } from '@tests/utils/testFactories.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { MeldNode, TextNode, DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';

describe('VariableReferenceResolver', () => {
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let parserService: ReturnType<typeof createMockParserService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    parserService = createMockParserService();
    resolver = new VariableReferenceResolver(stateService, undefined, parserService);
    context = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: 'test.meld',
      state: stateService
    };
  });

  describe('resolve', () => {
    it('should resolve text variables', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { identifier: 'greeting', value: 'Hello World' })
      ]);
      
      vi.mocked(stateService.getTextVar).mockReturnValue('Hello World');
      const result = await resolver.resolve('{{greeting}}', context);
      expect(result).toBe('Hello World');
      expect(stateService.getTextVar).toHaveBeenCalledWith('greeting');
      expect(parserService.parse).toHaveBeenCalled();
    });

    it('should resolve data variables when text variable not found', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('data', { identifier: 'data', value: 'Data Value' })
      ]);
      
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue('Data Value');
      const result = await resolver.resolve('{{data}}', context);
      expect(result).toBe('Data Value');
      expect(stateService.getTextVar).toHaveBeenCalledWith('data');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should handle multiple variable references', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createTextNode(''),
        createDirectiveNode('text', { identifier: 'greeting1', value: 'Hello' }),
        createTextNode(' '),
        createDirectiveNode('text', { identifier: 'greeting2', value: 'World' }),
        createTextNode('!')
      ]);
      
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Hello')
        .mockReturnValueOnce('World');
      const result = await resolver.resolve('{{greeting1}} {{greeting2}}!', context);
      expect(result).toBe('Hello World!');
    });

    it('should handle field access in data variables', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('data', { 
          identifier: 'data',
          fields: ['user', 'name']
        })
      ]);
      
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue({ user: { name: 'Alice' } });
      const result = await resolver.resolve('{{data.user.name}}', context);
      expect(result).toBe('Alice');
    });

    it('should handle environment variables', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { identifier: 'ENV_TEST' })
      ]);
      
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      await expect(resolver.resolve('{{ENV_TEST}}', context))
        .rejects
        .toThrow('Environment variable not set: ENV_TEST');
    });

    it('should throw on undefined variable', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { identifier: 'missing' })
      ]);
      
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      await expect(resolver.resolve('{{missing}}', context))
        .rejects
        .toThrow('Undefined variable: missing');
    });

    it('should preserve text without variables', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createTextNode('No variables here')
      ]);
      
      const result = await resolver.resolve('No variables here', context);
      expect(result).toBe('No variables here');
      expect(stateService.getTextVar).not.toHaveBeenCalled();
    });

    it('should handle mixed content with variables', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createTextNode('Hello '),
        createDirectiveNode('text', { identifier: 'name', value: 'Alice' }),
        createTextNode(', welcome to '),
        createDirectiveNode('text', { identifier: 'place', value: 'Wonderland' }),
        createTextNode('!')
      ]);
      
      vi.mocked(stateService.getTextVar)
        .mockReturnValueOnce('Alice')
        .mockReturnValueOnce('Wonderland');
      const result = await resolver.resolve(
        'Hello {{name}}, welcome to {{place}}!',
        context
      );
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });
    
    it('should fall back to regex resolution when parser fails', async () => {
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parser error'));
      
      vi.mocked(stateService.getTextVar).mockReturnValue('Fallback Value');
      
      const result = await resolver.resolve('{{fallback}}', context);
      expect(result).toBe('Fallback Value');
      expect(stateService.getTextVar).toHaveBeenCalledWith('fallback');
    });
  });

  describe('extractReferences', () => {
    it('should extract all variable references', async () => {
      const refs = resolver.extractReferences('{{var1}} and {{var2}} and {{var3}}');
      expect(refs).toEqual(['var1', 'var2', 'var3']);
    });

    it('should handle field access in references', async () => {
      const refs = resolver.extractReferences('{{data.field1}} and {{data.field2}}');
      expect(refs).toEqual(['data']);
    });

    it('should return empty array for no references', async () => {
      const refs = resolver.extractReferences('No variables here');
      expect(refs).toEqual([]);
    });

    it('should handle duplicate references', async () => {
      const refs = resolver.extractReferences('{{var1}} and {{var1}} and {{var1}}');
      expect(refs).toEqual(['var1']);
    });
  });
  
  describe('extractReferencesAsync', () => {
    it('should extract all variable references using AST when available', async () => {
      vi.mocked(parserService.parse).mockResolvedValue([
        createDirectiveNode('text', { identifier: 'var1' }),
        createTextNode(' and '),
        createDirectiveNode('text', { identifier: 'var2' }),
        createTextNode(' and '),
        createDirectiveNode('text', { identifier: 'var3' })
      ]);
      
      const refs = await resolver.extractReferencesAsync('{{var1}} and {{var2}} and {{var3}}');
      expect(refs).toEqual(['var1', 'var2', 'var3']);
      expect(parserService.parse).toHaveBeenCalled();
    });

    it('should fall back to regex when parser fails', async () => {
      vi.mocked(parserService.parse).mockRejectedValue(new Error('Parser error'));
      
      const refs = await resolver.extractReferencesAsync('{{var1}} and {{var2}}');
      expect(refs).toEqual(['var1', 'var2']);
    });
  });
}); 