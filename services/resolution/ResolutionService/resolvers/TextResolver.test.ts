import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextResolver } from './TextResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode } from 'meld-spec';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { 
  expectThrowsWithSeverity, 
  expectWarningsInPermissiveMode,
  ErrorCollector,
  createPermissiveModeOptions
} from '@tests/utils/ErrorTestUtils.js';

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

    it('should handle environment variables appropriately', async () => {
      // Arrange
      const originalEnv = process.env;
      process.env = { ...process.env, TEST_ENV_VAR: 'test-value' };
      
      // Act & Assert
      // Test that it resolves correctly when env var exists
      vi.mocked(stateService.getTextVar).mockImplementation((name) => {
        if (name === 'ENV_TEST_ENV_VAR') return 'test-value';
        return undefined;
      });
      
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'ENV_TEST_ENV_VAR',
          value: ''
        }
      };
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('test-value');
      
      // Test behavior for missing env vars
      const missingNode: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'ENV_MISSING_VAR',
          value: ''
        }
      };
      
      // Should throw with Recoverable severity
      try {
        await resolver.resolve(missingNode, context);
        fail('Expected to throw but did not');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldResolutionError);
        expect((error as MeldResolutionError).severity).toBe(ErrorSeverity.Recoverable);
        expect((error as MeldResolutionError).message).toContain('Environment variable not set');
      }
      
      // Cleanup
      process.env = originalEnv;
    });

    it('should handle undefined variables', async () => {
      // Arrange
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'undefined',
          value: ''
        }
      };
      
      // Act & Assert
      // Should throw with Recoverable severity
      try {
        await resolver.resolve(node, context);
        fail('Expected to throw but did not');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldResolutionError);
        expect((error as MeldResolutionError).severity).toBe(ErrorSeverity.Recoverable);
        expect((error as MeldResolutionError).message).toContain('Undefined text variable');
      }
    });
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