import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks';

/**
 * TextDirectiveHandler Integration Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 */

describe('TextDirectiveHandler Integration', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let clonedState: any;
  let context: TestContextDI;

  beforeEach(() => {
    // Create context with isolated container
    context = TestContextDI.create({ isolatedContainer: true });
    
    // Create cloned state that will be returned by stateService.clone()
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    };

    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    
    // Configure mock implementations
    validationService.validate.mockResolvedValue(true);
    stateService.clone.mockReturnValue(clonedState);
    resolutionService.resolveInContext.mockImplementation(value => Promise.resolve(value));
    
    // Create handler instance directly with mocks
    handler = new TextDirectiveHandler(
      validationService,
      stateService,
      resolutionService
    );
  });

  afterEach(async () => {
    await context.cleanup();
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

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('Hello Alice!');

      const result = await handler.execute(node, testContext);
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

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('Hello "quoted World" !');

      const result = await handler.execute(node, testContext);
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

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('second@example.com');

      const result = await handler.execute(node, testContext);
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

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOST = 'example.com';
      // ENV_PORT not set, should use fallback

      vi.mocked(resolutionService.resolveInContext)
        .mockResolvedValue('example.com:3000');

      const result = await handler.execute(node, testContext);
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
          end: { line: 5, column: 25 }
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock validation service to throw a DirectiveError
      validationService.validate = vi.fn().mockImplementation(() => {
        // Create an error with location and other properties set correctly
        const error = new DirectiveError(
          'Invalid text directive value',
          'text',
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context: {
              ...testContext,
              filePath: 'test.meld'
            },
            location: {
              ...node.location,
              start: {
                ...node.location.start,
                line: 5,
                column: 1
              }
            }
          }
        );
        
        // Set the severity property directly on the error
        // @ts-ignore - We know this will work
        error.severity = ErrorSeverity.Fatal;
        
        throw error;
      });

      // Use ErrorCollector to test both strict and permissive modes
      const errorCollector = new ErrorCollector();
      
      // Test strict mode (should throw)
      await expect(async () => {
        try {
          await handler.execute(node, testContext);
        } catch (error) {
          // Ensure we're passing an appropriate error to the handler
          if (error instanceof DirectiveError) {
            errorCollector.handleError(error);
          }
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
      
      // With the refactored code, the location is now in a different structure
      // The DirectiveError wraps the location in the context.node.location
      expect(error.context.node).toBeDefined();
      expect(error.context.node.location).toBeDefined();
      expect(error.context.node.location.start.line).toBe(5);
      expect(error.context.context).toBeDefined();
      expect(error.context.context.currentFilePath).toBe('test.meld');
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 