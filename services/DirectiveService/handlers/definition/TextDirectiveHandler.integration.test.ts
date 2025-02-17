import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/StateService/IStateService.js';

describe('TextDirectiveHandler Integration', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new TextDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('complex scenarios', () => {
    it('should handle nested variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello ${user.${type}.name}!'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('Hello Alice!');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
    });

    it('should handle mixed string literals and variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: '${prefix} "quoted ${name}" ${suffix}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('Hello "quoted World" !');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello "quoted World" !');
    });

    it('should handle complex data structure access', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'userInfo',
          value: '${user.contacts[${index}].email}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('second@example.com');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('userInfo', 'second@example.com');
    });

    it('should handle environment variables with fallbacks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'config',
          value: '${ENV_HOST:-localhost}:${ENV_PORT:-3000}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOST = 'example.com';
      // ENV_PORT not set, should use fallback

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('example.com:3000');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('config', 'example.com:3000');

      delete process.env.ENV_HOST;
    });

    it('should handle circular reference detection', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'circular',
          value: '${a}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockRejectedValue(new ResolutionError(
          'Circular reference detected: a -> b -> c -> a',
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value: '${a}', context }
        ));

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should handle error propagation through the stack', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'error',
          value: '${data.${missing}.value}'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockRejectedValue(new ResolutionError(
          'Undefined variable: missing',
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: 'missing', context }
        ));

      try {
        await handler.execute(node, context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(DirectiveError);
        expect(error.cause).toBeInstanceOf(ResolutionError);
        expect(error.details.node).toBeDefined();
        expect(error.details.context).toBeDefined();
      }
    });

    it('should handle validation errors with proper context', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: "'unterminated string with ${var"
        },
        location: {
          filePath: 'test.meld',
          line: 1,
          column: 1
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate)
        .mockRejectedValue(new Error('Invalid string literal'));

      try {
        await handler.execute(node, context);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(DirectiveError);
        expect(error.code).toBe('VALIDATION_FAILED');
        expect(error.details.node).toBeDefined();
        expect(error.details.location).toBeDefined();
      }
    });

    it('should handle mixed directive types', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'mixed',
          value: '@embed test.md | @run echo "hello"'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('@embed test.md | @run echo "hello"');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('mixed', '@embed test.md | @run echo "hello"');
    });
  });
}); 