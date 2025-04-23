import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError';
import type { DirectiveNode, InterpolatableValue, VariableReferenceNode, TextNode, StructuredPath } from '@core/syntax/types/nodes';
import type { IStateService } from '@services/state/StateService/IStateService';
import { ErrorCollector } from '@tests/utils/ErrorTestUtils';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError';
import { createLocation, createDirectiveNode as coreCreateDirectiveNode } from '@tests/utils/testFactories';
import type { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import { mock, mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { DirectiveResult } from '@core/directives/DirectiveHandler';
import { VariableDefinition, VariableType } from '@core/types/variables';
import { container, type DependencyContainer } from 'tsyringe';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import path from 'path';
import { PathPurpose } from '@core/types/paths';

/**
 * TextDirectiveHandler Integration Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete (Using Manual DI)
 * 
 * This test file has been fully migrated to use:
 * - Manual Child Container pattern
 * - Standardized mock factories with vitest-mock-extended
 */

describe('TextDirectiveHandler Integration', () => {
  let handler: TextDirectiveHandler;
  let testContainer: DependencyContainer;
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    mockValidationService = mockDeep<IValidationService>({
      validate: vi.fn(),
    });
    mockStateService = mockDeep<IStateService>({
      getCurrentFilePath: vi.fn(),
    });
    mockResolutionService = mockDeep<IResolutionService>({
      resolveNodes: vi.fn(),
    });
    mockFileSystemService = mockDeep<IFileSystemService>();
    mockPathService = mockDeep<IPathService>();

    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    testContainer.register(TextDirectiveHandler, { useClass: TextDirectiveHandler });

    handler = testContainer.resolve(TextDirectiveHandler);

    vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/test/dir/test.meld');

    vi.spyOn(mockResolutionService, 'resolveNodes').mockImplementation(async (nodes: InterpolatableValue, context: ResolutionContext): Promise<string> => {
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
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    const currentFilePath = mockStateService.getCurrentFilePath() || undefined;
    const resolutionContext: ResolutionContext = {
        state: mockStateService,
        strict: true,
        currentFilePath: currentFilePath,
        depth: 0,
        flags: {
            isVariableEmbed: false,
            isTransformation: false,
            allowRawContentResolution: false,
            isDirectiveHandler: false,
            isImportContext: false,
            processNestedVariables: true,
            preserveUnresolved: false
        },
        pathContext: {
            purpose: PathPurpose.READ,
            baseDir: currentFilePath ? path.dirname(currentFilePath) : '.',
            allowTraversal: false
        },
        withIncreasedDepth: vi.fn().mockReturnThis(),
        withStrictMode: vi.fn().mockReturnThis(),
        withAllowedTypes: vi.fn().mockReturnThis(),
        withFlags: vi.fn().mockReturnThis(),
        withFormattingContext: vi.fn().mockReturnThis(),
        withPathContext: vi.fn().mockReturnThis(),
        withParserFlags: vi.fn().mockReturnThis(),
    };
    return {
        state: mockStateService,
        resolutionContext: resolutionContext,
        formattingContext: { isBlock: false },
        directiveNode: node,
        executionContext: { cwd: '/test/dir' },
    };
  };

  describe('complex scenarios', () => {
    it('should handle nested variable references', async () => {
      const node: DirectiveNode = coreCreateDirectiveNode('text', {
        identifier: 'greeting',
        source: 'literal',
        value: [
          { type: 'Text', content: 'Hello ', location: createLocation(1, 1), nodeId: 't1' }, 
          { type: 'VariableReference', identifier: 'user', fields: [
            { type: 'field', value: 'name' }
          ], location: createLocation(1, 7), valueType: 'text', nodeId: 'vr1' },
          { type: 'Text', content: '!', location: createLocation(1, 20), nodeId: 't2' }
        ]
      }, createLocation(1,1));
      
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;
      
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('greeting');
      const varDef = result.stateChanges?.variables?.greeting;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Hello Alice!');
    });

    it('should handle mixed string literals and variables', async () => {
      const node: DirectiveNode = coreCreateDirectiveNode('text', {
        identifier: 'message',
        source: 'literal',
        value: [
          { type: 'VariableReference', identifier: 'prefix', location: createLocation(2, 1), valueType: 'text', nodeId: 'vr2' }, 
          { type: 'Text', content: ' "quoted ', location: createLocation(2, 10), nodeId: 't3' }, 
          { type: 'VariableReference', identifier: 'name', location: createLocation(2, 20), valueType: 'text', nodeId: 'vr3' }, 
          { type: 'Text', content: '" ', location: createLocation(2, 25), nodeId: 't4' }, 
          { type: 'VariableReference', identifier: 'suffix', location: createLocation(2, 28), valueType: 'text', nodeId: 'vr4' }
        ]
      }, createLocation(2,1));
      
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('message');
      const varDef = result.stateChanges?.variables?.message;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('Hello "quoted World" !');
    });

    it('should handle complex data structure access', async () => {
      const node: DirectiveNode = coreCreateDirectiveNode('text', {
        identifier: 'userInfo',
        source: 'literal',
        value: [
          { type: 'VariableReference', identifier: 'user', fields: [
            { type: 'field', value: 'contacts' }, 
            { type: 'index', value: 1 },
            { type: 'field', value: 'email' }
          ], location: createLocation(3, 1), valueType: 'data', nodeId: 'vr5' }
        ]
      }, createLocation(3,1));
      
      const processingContext = createMockProcessingContext(node);

      vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue('alice@example.com');

      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('userInfo');
      const varDef = result.stateChanges?.variables?.userInfo;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('alice@example.com');
    });

    it('should handle environment variables with fallbacks', async () => {
      const node: DirectiveNode = coreCreateDirectiveNode('text', {
        identifier: 'config',
        source: 'literal',
        value: [
          { type: 'VariableReference', identifier: 'ENV_HOST', fallback: 'localhost', location: createLocation(4, 1), valueType: 'text', nodeId: 'vr6' },
          { type: 'Text', content: ':', location: createLocation(4, 20), nodeId: 't5' },
          { type: 'VariableReference', identifier: 'ENV_PORT', fallback: '3000', location: createLocation(4, 21), valueType: 'text', nodeId: 'vr7' }
        ]
      }, createLocation(4,1));
      
      const processingContext = createMockProcessingContext(node);
      
      process.env.ENV_HOST = 'example.com';

      vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue('example.com:3000');

      const result = await handler.handle(processingContext) as DirectiveResult;
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('config');
      const varDef = result.stateChanges?.variables?.config;
      expect(varDef?.type).toBe(VariableType.TEXT);
      expect(varDef?.value).toBe('example.com:3000');
      delete process.env.ENV_HOST;
    });

    it.todo('should handle circular reference detection - Complex error handling deferred for V1');

    it.todo('should handle error propagation through the stack - Complex error propagation deferred for V1');

    it('should handle validation errors with proper context', async () => {
      const node: DirectiveNode = coreCreateDirectiveNode('text', {
        identifier: 'invalid',
        source: 'literal',
        value: null as any
      }, createLocation(5, 1));
      
      const testFilePath = '/test/dir/test.meld';
      vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(testFilePath);
      
      const processingContext = createMockProcessingContext(node);

      const validationError = new Error('Validation failed for test');
      vi.spyOn(mockValidationService, 'validate').mockRejectedValueOnce(validationError);

      const errorCollector = new ErrorCollector();
      let thrownError: any;
      
      try {
          await handler.handle(processingContext);
      } catch (error) {
          thrownError = error;
      }
      
      expect(thrownError).toBeDefined();
      expect(thrownError).toBeInstanceOf(DirectiveError);

      expect(thrownError.details).toBeDefined(); 
      expect(thrownError.details?.node).toBe(node); 
      expect(thrownError.details?.node?.location?.start?.line).toBe(5); 
      expect(thrownError.details?.context).toBeDefined();
    });

    it.todo('should handle mixed directive types - Complex directive interaction deferred for V1');
  });
}); 