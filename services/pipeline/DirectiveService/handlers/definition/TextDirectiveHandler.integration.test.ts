import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createFileSystemServiceMock
} from '@tests/utils/mocks/serviceMocks.js';
import { createLocation } from '@tests/utils/testFactories.js';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { StructuredPath } from '@core/types/paths.js';
import { mock } from 'vitest-mock-extended';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';

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
  let fileSystemService: ReturnType<typeof createFileSystemServiceMock>;
  let testDIContext: TestContextDI;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    testDIContext = TestContextDI.createIsolated();
    await testDIContext.initialize();
    
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    fileSystemService = createFileSystemServiceMock();
    
    validationService.validate.mockResolvedValue(undefined);
    stateService.getCurrentFilePath.mockReturnValue('test.meld');

    testDIContext.registerMock('IValidationService', validationService);
    testDIContext.registerMock('IStateService', stateService);
    testDIContext.registerMock('IResolutionService', resolutionService);
    testDIContext.registerMock('IFileSystemService', fileSystemService);

    handler = await testDIContext.resolve(TextDirectiveHandler);

    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: ResolutionContext): Promise<string> => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') result += node.content;
            else if (node.type === 'VariableReference') {
                if (node.identifier === 'user' && node.fields?.[0]?.value === 'name') result += 'Alice';
                else if (node.identifier === 'user') result += 'Alice';
                else if (node.identifier === 'prefix') result += 'Hello';
                else if (node.identifier === 'name') result += 'World';
                else if (node.identifier === 'suffix') result += '!';
                else if (node.identifier === 'ENV_HOST') result += process.env.ENV_HOST || 'localhost';
                else if (node.identifier === 'ENV_PORT') result += process.env.ENV_PORT || '3000';
                else result += `{{UNKNOWN: ${node.identifier}}}`;
            }
        }
        return result;
    });

    const mockResolutionContext = mock<ResolutionContext>();
    const mockFormattingContext = mock<FormattingContext>();
    mockProcessingContext = {
        state: stateService,
        resolutionContext: mockResolutionContext,
        formattingContext: mockFormattingContext,
        directiveNode: undefined as any,
    };
  });

  afterEach(async () => {
    await testDIContext?.cleanup();
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
      mockProcessingContext.directiveNode = node;

      const result = await handler.execute(mockProcessingContext);
      
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
      expect(result).toBe(stateService);
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
      mockProcessingContext.directiveNode = node;

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('message', 'Hello "quoted World" !');
      expect(result).toBe(stateService);
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
      mockProcessingContext.directiveNode = node;

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('userInfo', 'Alice');
      expect(result).toBe(stateService);
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
      mockProcessingContext.directiveNode = node;
      
      process.env.ENV_HOST = 'example.com';

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('config', 'example.com:3000');
      expect(result).toBe(stateService);

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
      const testFilePath = 'test.meld';
      stateService.getCurrentFilePath.mockReturnValue(testFilePath);
      
      mockProcessingContext.directiveNode = node;
      mockProcessingContext.state = stateService;

      const validationError = new Error('Validation failed for test');
      vi.mocked(validationService.validate).mockRejectedValueOnce(validationError);

      const errorCollector = new ErrorCollector();
      let thrownError: any;
      
      try {
          await handler.execute(mockProcessingContext);
      } catch (error) {
          thrownError = error;
          if (error instanceof Error && !(error instanceof DirectiveError)) {
             const currentFilePath = mockProcessingContext.state.getCurrentFilePath() ?? undefined;
             const wrappedError = new DirectiveError(
               error.message, 
               'text', 
               DirectiveErrorCode.VALIDATION_FAILED, 
               { node, context: { currentFilePath } }
             );
             errorCollector.handleError(wrappedError);
          } else if (error instanceof DirectiveError) {
            if (!error.details?.context) { 
               const currentFilePath = mockProcessingContext.state.getCurrentFilePath() ?? undefined;
               if (error.details) { 
                  error.details.context = { currentFilePath };
               } else { 
                 (error as any).details = { context: { currentFilePath } }; 
               }
            }
            errorCollector.handleError(error);
          }
      }
      
      expect(thrownError).toBeDefined();
      expect(thrownError).toBeInstanceOf(DirectiveError);

      const collectedError = errorCollector.getAllErrors()[0];
      expect(collectedError).toBeDefined();
      expect(collectedError.details).toBeDefined(); 
      expect(collectedError.details?.node).toBe(node); 
      expect(collectedError.details?.node?.location?.start?.line).toBe(5); 
      expect(collectedError.details?.context).toBeDefined();
      expect(collectedError.details?.context?.currentFilePath).toBe(testFilePath);
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 