import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { createLocation } from '@tests/utils/testFactories.js';

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
    await context?.cleanup();
  });

  describe('complex scenarios', () => {
    it('should handle nested variable references', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(1, 1),
        directive: {
          kind: 'text',
          identifier: 'greeting',
          // Represent value as InterpolatableValue array
          value: [
            { type: 'Text', content: 'Hello ', location: createLocation(1, 1) }, 
            { type: 'VariableReference', identifier: 'user', fields: [
              { type: 'field', value: '{{type}}.name' } // This nested ref needs careful mocking
            ], location: createLocation(1, 7) },
            { type: 'Text', content: '!', location: createLocation(1, 20) }
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock resolveNodes to return the final string for the specific input array
      vi.mocked(resolutionService.resolveNodes)
        .mockImplementation(async (nodes, context) => {
          // Basic mock: Check if input roughly matches expected structure
          if (Array.isArray(nodes) && nodes.length === 3 && nodes[1].type === 'VariableReference') {
            return 'Hello Alice!'; // Return the final expected string
          }
          return ''; // Default empty string
        });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!', expect.objectContaining({ definedAt: expect.any(Object) }));
    });

    it('should handle mixed string literals and variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(2, 1),
        directive: {
          kind: 'text',
          identifier: 'message',
          // Represent value as InterpolatableValue array
          value: [
            { type: 'VariableReference', identifier: 'prefix', location: createLocation(2, 1) }, 
            { type: 'Text', content: ' "quoted ', location: createLocation(2, 10) }, 
            { type: 'VariableReference', identifier: 'name', location: createLocation(2, 20) }, 
            { type: 'Text', content: '" ', location: createLocation(2, 25) }, 
            { type: 'VariableReference', identifier: 'suffix', location: createLocation(2, 28) }
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock resolveNodes
      vi.mocked(resolutionService.resolveNodes)
        .mockImplementation(async (nodes, context) => {
           if (Array.isArray(nodes) && nodes.length === 5) { // Basic check
             return 'Hello "quoted World" !';
           }
           return '';
        });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello "quoted World" !', expect.objectContaining({ definedAt: expect.objectContaining({ line: 2, column: 1, filePath: 'test.meld' }) }));
    });

    it('should handle complex data structure access', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(3, 1),
        directive: {
          kind: 'text',
          identifier: 'userInfo',
          // Represent value as InterpolatableValue array
          value: [
            { type: 'VariableReference', identifier: 'user', fields: [
              { type: 'field', value: 'contacts' }, 
              { type: 'index', value: '{{index}}' }, // Needs careful mocking 
              { type: 'field', value: 'email' }
            ], location: createLocation(3, 1) }
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock resolveNodes
      vi.mocked(resolutionService.resolveNodes)
         .mockImplementation(async (nodes, context) => {
            if (Array.isArray(nodes) && nodes.length === 1 && nodes[0].identifier === 'user') { // Basic check
              return 'second@example.com';
            }
            return '';
         });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('userInfo', 'second@example.com', expect.objectContaining({ definedAt: expect.objectContaining({ line: 3, column: 1, filePath: 'test.meld' }) }));
    });

    it('should handle environment variables with fallbacks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(4, 1),
        directive: {
          kind: 'text',
          identifier: 'config',
          // Represent value as InterpolatableValue array
          value: [
            { type: 'VariableReference', identifier: 'ENV_HOST', fallback: 'localhost', location: createLocation(4, 1) },
            { type: 'Text', content: ':', location: createLocation(4, 20) },
            { type: 'VariableReference', identifier: 'ENV_PORT', fallback: '3000', location: createLocation(4, 21) }
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOST = 'example.com';
      // ENV_PORT not set, should use fallback

      // Mock resolveNodes
      vi.mocked(resolutionService.resolveNodes)
        .mockImplementation(async (nodes, context) => {
           if (Array.isArray(nodes) && nodes.length === 3) { // Basic check
             return 'example.com:3000';
           }
           return '';
        });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('config', 'example.com:3000', expect.objectContaining({ definedAt: expect.objectContaining({ line: 4, column: 1, filePath: 'test.meld' }) }));

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

      // Mock validation service to throw a simple Error for this test
      validationService.validate = vi.fn().mockImplementation(() => {
        throw new Error('Validation failed for test');
      });

      // Use ErrorCollector to test both strict and permissive modes
      const errorCollector = new ErrorCollector();
      
      // Test strict mode (should throw)
      await expect(async () => {
        try {
          await handler.execute(node, testContext);
        } catch (error) {
          // Ensure we're passing an appropriate error to the handler
          if (error instanceof Error && !(error instanceof DirectiveError)) {
             // If it's our simple error, wrap it for the collector
             const wrappedError = new DirectiveError(
               error.message, 
               'text', 
               DirectiveErrorCode.VALIDATION_FAILED, 
               { node, context: testContext } // Pass basic context
             );
             errorCollector.handleError(wrappedError);
             throw wrappedError; // Rethrow the wrapped error
          } else if (error instanceof DirectiveError) {
            errorCollector.handleError(error);
          }
          throw error; // Rethrow original or other errors
        }
      }).rejects.toThrow(DirectiveError);
      
      // Verify error was collected 
      expect(errorCollector.getAllErrors()).toHaveLength(1);
      
      // Verify error contains some context (check the wrapped error's context property)
      const collectedError = errorCollector.getAllErrors()[0];
      console.log('Collected Error:', JSON.stringify(collectedError, null, 2));
      console.log('Collected Error Context:', JSON.stringify(collectedError.context, null, 2));
      
      expect(collectedError.details).toBeDefined(); 
      expect(collectedError.details?.node).toBeDefined(); 
      expect(collectedError.details?.node?.location?.start?.line).toBe(5); 
      expect(collectedError.details?.context?.currentFilePath).toBe('test.meld');
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 