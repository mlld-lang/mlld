import { describe, it, expect, beforeEach, vi } from 'vitest';
import { container, type DependencyContainer } from 'tsyringe';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import { VariableType } from '@core/types/variables';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { FormattingContext } from '@core/types/resolution';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { createDirectiveNode, createTextNode, createVariableReferenceNode } from '@tests/utils/testFactories';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { ILogger } from '@core/utils/logger';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { mock } from 'vitest-mock-extended';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import type { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import { DirectiveNode } from '@core/syntax/types';
import { MeldNode } from '@core/syntax/types';

describe('Directive State Change Propagation', () => {
  let testContainer: DependencyContainer;
  let directiveService: IDirectiveService;
  let stateService: IStateService;
  let mockStateService: IStateService;
  let mockValidationService: IValidationService;
  let mockPathService: IPathService;
  let mockFileSystemService: IFileSystemService;
  let mockParserService: IParserService;
  let mockCircularityService: ICircularityService;
  let mockResolutionService: IResolutionService;
  let mockTextHandler: IDirectiveHandler;
  let mockLogger: ILogger;
  let mockInterpreterService: IInterpreterService;
  let mockInterpreterClient: IInterpreterServiceClient;
  let mockInterpreterServiceClientFactory: InterpreterServiceClientFactory;

  beforeEach(async () => {
    testContainer = container.createChildContainer();

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      level: 'error'
    };

    // Create mock interpreter client
    mockInterpreterClient = {
      interpret: vi.fn().mockImplementation(async (nodes, options, initialState) => initialState || mockStateService),
      createChildContext: vi.fn().mockImplementation(async (parentState) => parentState.clone())
    };

    // Create mock interpreter service client factory
    mockInterpreterServiceClientFactory = {
      createClient: vi.fn().mockReturnValue(mockInterpreterClient)
    };

    // Create manual mock objects with all required methods
    mockStateService = {
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommandVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommandVar: vi.fn(),
      getCurrentFilePath: vi.fn(),
      clone: vi.fn(),
      getStateId: vi.fn(),
      isTransformationEnabled: vi.fn(),
      getParentState: vi.fn(),
      getAllTextVars: vi.fn(),
      getAllDataVars: vi.fn(),
      getAllPathVars: vi.fn(),
      getAllCommandVars: vi.fn(),
      createChildState: vi.fn(),
      mergeChildState: vi.fn(),
      setCurrentFilePath: vi.fn(),
      getVariable: vi.fn(),
      setVariable: vi.fn(),
      hasVariable: vi.fn(),
      setTransformationEnabled: vi.fn(),
      setTransformationOptions: vi.fn(),
      getAllCommands: vi.fn(),
      addNode: vi.fn()
    } as IStateService;

    // Setup spies with default implementations
    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('test.meld');
    vi.spyOn(mockStateService, 'clone').mockImplementation(() => mockStateService);
    vi.spyOn(mockStateService, 'getStateId').mockReturnValue('test-state');
    vi.spyOn(mockStateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(mockStateService, 'getParentState').mockReturnValue(null);
    vi.spyOn(mockStateService, 'getAllTextVars').mockReturnValue(new Map());
    vi.spyOn(mockStateService, 'getAllDataVars').mockReturnValue(new Map());
    vi.spyOn(mockStateService, 'getAllPathVars').mockReturnValue(new Map());
    vi.spyOn(mockStateService, 'getAllCommandVars').mockReturnValue(new Map());
    vi.spyOn(mockStateService, 'createChildState').mockImplementation(() => mockStateService);

    mockValidationService = {
      validate: vi.fn(),
      registerValidator: vi.fn(),
      removeValidator: vi.fn(),
      getRegisteredDirectiveKinds: vi.fn()
    } as IValidationService;
    vi.spyOn(mockValidationService, 'validate').mockResolvedValue();

    mockPathService = {
      resolvePath: vi.fn(),
      validatePath: vi.fn(),
      normalizePath: vi.fn(),
      dirname: vi.fn(),
      basename: vi.fn(),
      join: vi.fn(),
      isAbsolute: vi.fn()
    } as IPathService;
    vi.spyOn(mockPathService, 'resolvePath').mockReturnValue('/resolved/path');
    vi.spyOn(mockPathService, 'validatePath').mockReturnValue(true);
    vi.spyOn(mockPathService, 'normalizePath').mockImplementation(path => path);
    vi.spyOn(mockPathService, 'dirname').mockReturnValue('/resolved');
    vi.spyOn(mockPathService, 'basename').mockReturnValue('path');
    vi.spyOn(mockPathService, 'join').mockImplementation((...parts) => parts.join('/'));
    vi.spyOn(mockPathService, 'isAbsolute').mockReturnValue(true);

    mockFileSystemService = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      exists: vi.fn(),
      mkdir: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      rm: vi.fn()
    } as IFileSystemService;
    vi.spyOn(mockFileSystemService, 'readFile').mockResolvedValue('file content');
    vi.spyOn(mockFileSystemService, 'exists').mockResolvedValue(true);
    vi.spyOn(mockFileSystemService, 'stat').mockResolvedValue({ isDirectory: () => false });

    mockParserService = {
      parse: vi.fn(),
      parseWithLocation: vi.fn(),
      parseFile: vi.fn()
    } as IParserService;
    vi.spyOn(mockParserService, 'parse').mockReturnValue([]);
    vi.spyOn(mockParserService, 'parseFile').mockResolvedValue([]);

    mockCircularityService = {
      beginImport: vi.fn(),
      endImport: vi.fn(),
      isInStack: vi.fn(),
      checkVariableReference: vi.fn(),
      getImportStack: vi.fn(),
      reset: vi.fn()
    } as ICircularityService;
    vi.spyOn(mockCircularityService, 'isInStack').mockReturnValue(false);
    vi.spyOn(mockCircularityService, 'getImportStack').mockReturnValue([]);

    // Create and register IInterpreterService first
    mockInterpreterService = mock<IInterpreterService>();
    testContainer.register('IInterpreterService', { useValue: mockInterpreterService });

    mockResolutionService = {
      resolveText: vi.fn(),
      resolveData: vi.fn(),
      resolvePath: vi.fn(),
      resolveCommand: vi.fn(),
      resolveFile: vi.fn(),
      resolveContent: vi.fn(),
      resolveInContext: vi.fn(),
      resolveNodes: vi.fn(),
      validateResolution: vi.fn(),
      detectCircularReferences: vi.fn(),
      extractSection: vi.fn(),
      convertToFormattedString: vi.fn(),
      enableResolutionTracking: vi.fn(),
      getResolutionTracker: vi.fn(),
      validatePath: vi.fn(),
      getVariableResolver: vi.fn()
    } as IResolutionService;
    vi.spyOn(mockResolutionService, 'resolveText').mockImplementation(async (text) => text);
    vi.spyOn(mockResolutionService, 'resolveData').mockImplementation(async (node) => node);
    vi.spyOn(mockResolutionService, 'resolvePath').mockImplementation(async (path) => path);
    vi.spyOn(mockResolutionService, 'resolveCommand').mockImplementation(async (cmd) => cmd);
    vi.spyOn(mockResolutionService, 'resolveFile').mockImplementation(async (path) => 'file content');
    vi.spyOn(mockResolutionService, 'resolveContent').mockImplementation(async (nodes) => nodes.map(n => n.type === 'Text' ? n.content : 'RESOLVED').join(''));
    vi.spyOn(mockResolutionService, 'resolveNodes').mockImplementation(async (nodes) => nodes.map(n => n.type === 'Text' ? n.content : 'RESOLVED').join(''));
    vi.spyOn(mockResolutionService, 'validatePath').mockReturnValue(true);

    // Create mock text handler
    mockTextHandler = {
      kind: 'text',
      handle: vi.fn(async (ctx: DirectiveProcessingContext) => {
        const node = ctx.directiveNode as DirectiveNode;
        const identifier = node.raw?.identifier;
        const values = node.values?.value || node.values?.content; // Check both for compatibility
        
        if (identifier && Array.isArray(values)) {
          const resolvedValue = values
            .map(n => n.type === 'Text' ? n.content : 'RESOLVED')
            .join('');
          return {
            stateChanges: {
              variables: {
                [identifier]: {
                  type: VariableType.TEXT,
                  value: resolvedValue
                }
              }
            }
          };
        }
        return { stateChanges: undefined };
      })
    };

    // Register all services with their string tokens
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.registerInstance<ICircularityService>('ICircularityService', mockCircularityService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<ILogger>('ILogger', mockLogger);
    testContainer.registerInstance('InterpreterServiceClientFactory', mockInterpreterServiceClientFactory);
    testContainer.registerInstance('DependencyContainer', testContainer);

    // Register directive handlers using the IDirectiveHandler token
    testContainer.register('IDirectiveHandler', { useValue: mockTextHandler });

    // Register the DirectiveService
    testContainer.register(DirectiveService, { useClass: DirectiveService });
    directiveService = testContainer.resolve(DirectiveService);
    stateService = mockStateService;

    // Setup common mock behaviors
    vi.spyOn(mockInterpreterClient, 'interpret').mockImplementation(async (nodes: MeldNode[]) => mockStateService);
    vi.spyOn(mockInterpreterClient, 'createChildContext').mockImplementation(async () => mockStateService);
    vi.spyOn(mockStateService, 'getStateId').mockReturnValue('test-state-id');
    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/test/file.meld');
    vi.spyOn(mockStateService, 'addNode').mockImplementation();
    vi.spyOn(mockStateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(mockPathService, 'dirname').mockReturnValue('/test');
  });

  describe('State Changes from Single Directive', () => {
    it('should correctly propagate text variable state changes', async () => {
      const textValue: InterpolatableValue = [
        createTextNode('Hello '),
        createVariableReferenceNode('name', 'text'),
        createTextNode('!')
      ];
      
      const textNode = createDirectiveNode('text', { 
        identifier: 'greeting',
        value: textValue
      });

      const processingContext: DirectiveProcessingContext = {
        state: stateService,
        resolutionContext: ResolutionContextFactory.create(stateService, 'test.meld'),
        formattingContext: {} as FormattingContext,
        executionContext: undefined,
        directiveNode: textNode
      };

      const result = await directiveService.handleDirective(textNode, processingContext);

      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toBeDefined();
      expect(result.stateChanges?.variables?.greeting).toEqual({
        type: VariableType.TEXT,
        value: 'Hello RESOLVED!'
      });
    });

    it('should handle multiple state changes in a single directive result', async () => {
      // Register a handler that changes multiple variables
      const mockMultiHandler = {
        kind: 'multi',
        handle: vi.fn(async () => ({
          stateChanges: {
            variables: {
              var1: { type: VariableType.TEXT, value: 'text1' },
              var2: { type: VariableType.DATA, value: { key: 'value' } },
              var3: { type: VariableType.PATH, value: '/test/path' }
            }
          }
        }))
      };

      // Register the new handler
      testContainer.register('IDirectiveHandler', { useValue: mockMultiHandler });
      directiveService = testContainer.resolve(DirectiveService);

      const multiNode = createDirectiveNode('multi', { 
        identifier: 'multi_test',
        value: 'test'
      });

      const processingContext: DirectiveProcessingContext = {
        state: stateService,
        resolutionContext: ResolutionContextFactory.create(stateService, 'test.meld'),
        formattingContext: {} as FormattingContext,
        executionContext: undefined,
        directiveNode: multiNode
      };

      const result = await directiveService.handleDirective(multiNode, processingContext);

      expect(result.stateChanges?.variables).toEqual({
        var1: { type: VariableType.TEXT, value: 'text1' },
        var2: { type: VariableType.DATA, value: { key: 'value' } },
        var3: { type: VariableType.PATH, value: '/test/path' }
      });
    });
  });

  describe('State Change Type Safety', () => {
    it('should enforce variable type consistency in state changes', async () => {
      const mockHandler = {
        kind: 'test',
        handle: vi.fn(async () => ({
          stateChanges: {
            variables: {
              // @ts-expect-error - Should not allow wrong type for text variable
              textVar: { type: VariableType.TEXT, value: { invalid: 'object' } },
              
              // @ts-expect-error - Should not allow wrong type for data variable
              dataVar: { type: VariableType.DATA, value: 'invalid string' },
              
              // @ts-expect-error - Should not allow wrong type for path variable
              pathVar: { type: VariableType.PATH, value: { invalid: 'object' } },
              
              // This one should be valid
              validVar: { type: VariableType.TEXT, value: 'valid string' }
            }
          }
        }))
      };

      // Register the new handler
      testContainer.register('IDirectiveHandler', { useValue: mockHandler });
      directiveService = testContainer.resolve(DirectiveService);

      const testNode = createDirectiveNode('test', { 
        identifier: 'test_var',
        value: 'test'
      });

      const processingContext: DirectiveProcessingContext = {
        state: stateService,
        resolutionContext: ResolutionContextFactory.create(stateService, 'test.meld'),
        formattingContext: {} as FormattingContext,
        executionContext: undefined,
        directiveNode: testNode
      };

      const result = await directiveService.handleDirective(testNode, processingContext);

      // Even with type errors, the handler should still work
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables?.validVar).toEqual({
        type: VariableType.TEXT,
        value: 'valid string'
      });
    });

    it('should preserve variable metadata in state changes', async () => {
      const mockHandler = {
        kind: 'metadata',
        handle: vi.fn(async () => ({
          stateChanges: {
            variables: {
              withMeta: {
                type: VariableType.TEXT,
                value: 'test',
                metadata: {
                  source: 'test',
                  timestamp: Date.now(),
                  custom: { key: 'value' }
                }
              }
            }
          }
        }))
      };

      // Register the new handler
      testContainer.register('IDirectiveHandler', { useValue: mockHandler });
      directiveService = testContainer.resolve(DirectiveService);

      const metaNode = createDirectiveNode('metadata', { 
        identifier: 'meta_test',
        value: 'test'
      });

      const processingContext: DirectiveProcessingContext = {
        state: stateService,
        resolutionContext: ResolutionContextFactory.create(stateService, 'test.meld'),
        formattingContext: {} as FormattingContext,
        executionContext: undefined,
        directiveNode: metaNode
      };

      const result = await directiveService.handleDirective(metaNode, processingContext);

      expect(result.stateChanges?.variables?.withMeta).toMatchObject({
        type: VariableType.TEXT,
        value: 'test',
        metadata: expect.objectContaining({
          source: 'test',
          timestamp: expect.any(Number),
          custom: { key: 'value' }
        })
      });
    });
  });
}); 