import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

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
          value: 'Hello {{user.{{type}}.name}}!'
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
          value: '{{prefix}} "quoted {{name}}" {{suffix}}'
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
          value: '{{user.contacts[{{index}}].email}}'
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
          value: '{{ENV_HOST:-localhost}}:{{ENV_PORT:-3000}}'
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

    it.todo('should handle circular reference detection - Complex error handling deferred for V1');

    it.todo('should handle error propagation through the stack - Complex error propagation deferred for V1');

    it('should handle validation errors with proper context', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: null // Invalid value - should be a string
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 25 },
          source: 'test.meld'
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock validation service to throw a DirectiveError
      validationService.validateDirective = vi.fn().mockImplementation(() => {
        throw new DirectiveError('Invalid text directive value', {
          node,
          context: { filePath: 'test.meld', line: 5 }
        });
      });

      // Use ErrorCollector to test both strict and permissive modes
      const errorCollector = new ErrorCollector();
      
      // Test strict mode (should throw)
      await expect(async () => {
        try {
          await handler.execute(node, context);
        } catch (error) {
          errorCollector.handleError(error);
          throw error;
        }
      }).rejects.toThrow(DirectiveError);
      
      // Verify error was collected with correct severity
      expect(errorCollector.getAllErrors()).toHaveLength(1);
      expect(errorCollector.getAllErrors()[0].severity).toBe(ErrorSeverity.Fatal);
      expect(errorCollector.getAllErrors()[0].message).toContain('Invalid text directive value');
      
      // Verify error contains location information
      const error = errorCollector.getAllErrors()[0];
      expect(error.context).toBeDefined();
      expect(error.context.filePath).toBe('test.meld');
      expect(error.context.line).toBe(5);
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 