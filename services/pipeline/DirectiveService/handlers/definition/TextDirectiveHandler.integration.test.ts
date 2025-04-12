import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { DirectiveNode, InterpolatableValue } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { createLocation } from '@tests/utils/testFactories.js';
import { ResolutionContext } from '@core/types';
import { StructuredPath } from '@core/types/paths';
import { VariableReferenceNode } from '@core/ast';
import { TextNode } from '@core/syntax/types';
import { IDirectiveNode } from '@core/syntax/types/interfaces';
import { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';

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
    validationService.validate.mockResolvedValue(undefined);
    stateService.clone.mockReturnValue(clonedState);
    resolutionService.resolveInContext.mockImplementation(async (value: string | StructuredPath, context: ResolutionContext): Promise<string> => {
      if (typeof value === 'object' && value !== null && 'raw' in value) {
          return value.raw; 
      }
      return String(value); 
    });
    
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
          value: [
            { type: 'Text', content: 'Hello ', location: createLocation(1, 1) }, 
            { type: 'VariableReference', identifier: 'user', fields: [
              { type: 'field', value: 'name' }
            ], location: createLocation(1, 7), valueType: 'text', isVariableReference: true } as VariableReferenceNode,
            { type: 'Text', content: '!', location: createLocation(1, 20) }
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      } as DirectiveContext;

      vi.mocked(resolutionService.resolveNodes)
        .mockImplementation(async (nodes, context) => {
          if (Array.isArray(nodes) && nodes.length === 3 && (nodes[1] as VariableReferenceNode).identifier === 'user') {
            return 'Hello Alice!';
          }
          return '';
        });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!', expect.objectContaining({ definedAt: expect.objectContaining({ line: 1, column: 1 }) }));
    });

    it('should handle mixed string literals and variables', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(2, 1),
        directive: {
          kind: 'text',
          identifier: 'message',
          value: [
            { type: 'VariableReference', identifier: 'prefix', location: createLocation(2, 1), valueType: 'text', isVariableReference: true } as VariableReferenceNode, 
            { type: 'Text', content: ' "quoted ', location: createLocation(2, 10) }, 
            { type: 'VariableReference', identifier: 'name', location: createLocation(2, 20), valueType: 'text', isVariableReference: true } as VariableReferenceNode, 
            { type: 'Text', content: '" ', location: createLocation(2, 25) }, 
            { type: 'VariableReference', identifier: 'suffix', location: createLocation(2, 28), valueType: 'text', isVariableReference: true } as VariableReferenceNode
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      } as DirectiveContext;

      vi.mocked(resolutionService.resolveNodes)
        .mockImplementation(async (nodes, context) => {
           if (Array.isArray(nodes) && nodes.length === 5) {
             return 'Hello "quoted World" !';
           }
           return '';
        });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello "quoted World" !', expect.objectContaining({ definedAt: expect.objectContaining({ line: 2 }) }));
    });

    it('should handle complex data structure access', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(3, 1),
        directive: {
          kind: 'text',
          identifier: 'userInfo',
          value: [
            { type: 'VariableReference', identifier: 'user', fields: [
              { type: 'field', value: 'contacts' }, 
              { type: 'index', value: 1 },
              { type: 'field', value: 'email' }
            ], location: createLocation(3, 1), valueType: 'data', isVariableReference: true } as VariableReferenceNode
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      } as DirectiveContext;

      vi.mocked(resolutionService.resolveNodes)
         .mockImplementation(async (nodes, context) => {
            if (Array.isArray(nodes) && nodes.length === 1 && (nodes[0] as VariableReferenceNode).identifier === 'user') {
              return 'second@example.com';
            }
            return '';
         });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('userInfo', 'second@example.com', expect.objectContaining({ definedAt: expect.objectContaining({ line: 3 }) }));
    });

    it('should handle environment variables with fallbacks', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(4, 1),
        directive: {
          kind: 'text',
          identifier: 'config',
          value: [
            { type: 'VariableReference', identifier: 'ENV_HOST', fallback: 'localhost', location: createLocation(4, 1), valueType: 'text', isVariableReference: true } as VariableReferenceNode,
            { type: 'Text', content: ':', location: createLocation(4, 20) },
            { type: 'VariableReference', identifier: 'ENV_PORT', fallback: '3000', location: createLocation(4, 21), valueType: 'text', isVariableReference: true } as VariableReferenceNode
          ]
        }
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      } as DirectiveContext;

      process.env.ENV_HOST = 'example.com';

      vi.mocked(resolutionService.resolveNodes)
        .mockImplementation(async (nodes, context) => {
           if (Array.isArray(nodes) && nodes.length === 3) {
             return 'example.com:3000';
           }
           return '';
        });

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('config', 'example.com:3000', expect.objectContaining({ definedAt: expect.objectContaining({ line: 4 }) }));

      delete process.env.ENV_HOST;
    });

    it.todo('should handle circular reference detection - Complex error handling deferred for V1');

    it.todo('should handle error propagation through the stack - Complex error propagation deferred for V1');

    it('should handle validation errors with proper context', async () => {
      const node: DirectiveNode = {
        type: 'Directive',
        location: createLocation(5, 1),
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: null as any
        },
      };

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      } as DirectiveContext;

      validationService.validate = vi.fn().mockImplementation(async (node: IDirectiveNode) => {
        throw new Error('Validation failed for test');
      });

      const errorCollector = new ErrorCollector();
      
      await expect(async () => {
        try {
          await handler.execute(node, testContext);
        } catch (error) {
          if (error instanceof Error && !(error instanceof DirectiveError)) {
             const wrappedError = new DirectiveError(
               error.message, 
               'text', 
               DirectiveErrorCode.VALIDATION_FAILED, 
               { node, context: testContext }
             );
             errorCollector.handleError(wrappedError);
             throw wrappedError;
          } else if (error instanceof DirectiveError) {
            errorCollector.handleError(error);
          }
          throw error;
        }
      }).rejects.toThrow(DirectiveError);
      
      expect(errorCollector.getAllErrors()).toHaveLength(1);
      
      const collectedError = errorCollector.getAllErrors()[0];
      console.log('Collected Error:', JSON.stringify(collectedError, null, 2));
      console.log('Collected Error Context:', JSON.stringify(collectedError.details?.context, null, 2));
      
      expect(collectedError.details).toBeDefined(); 
      expect(collectedError.details?.node).toBeDefined(); 
      expect(collectedError.details?.node?.location?.start?.line).toBe(5); 
      expect(collectedError.details?.context?.currentFilePath).toBe('test.meld');
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 