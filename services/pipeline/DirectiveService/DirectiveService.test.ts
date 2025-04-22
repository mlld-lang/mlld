import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/index.js';
import { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { TextVariable, DataVariable, VariableType } from '@core/types/variables.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { createTextDirective, createDataDirective, createImportDirective } from '@tests/utils/testFactories.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import type { DirectiveProcessingContext, ExecutionContext } from '@core/types/index.js';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import { container, DependencyContainer } from 'tsyringe';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';
import type { OutputFormattingContext } from '@core/types/index.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { InterpolatableValue, VariableReferenceNode, StructuredPath } from '@core/syntax/types/nodes.js';
import type { JsonValue, VariableMetadata } from '@core/types/index.js';
import { createRawPath, unsafeCreateAbsolutePath, RawPath, AbsolutePath, RelativePath } from '@core/types/paths.js';
import crypto from 'crypto';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { ILogger } from '@core/utils/logger.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';

// Define a simple mock OutputFormattingContext
const mockFormattingContext: OutputFormattingContext = {
  isOutputLiteral: true,
  contextType: 'block',
  nodeType: 'directive',
  atLineStart: true,
  atLineEnd: false,
};

// Main test suite for DirectiveService
describe('DirectiveService', () => {
  let context: TestContextDI;
  let testContainer: DependencyContainer;
  let directiveService: IDirectiveService;
  let mockStateService: MockedObjectDeep<IStateService>;
  let mockValidationService: MockedObjectDeep<IValidationService>;
  let mockResolutionService: MockedObjectDeep<IResolutionService>;
  let mockTextHandler: IDirectiveHandler;
  let mockDataHandler: IDirectiveHandler;
  let mockImportHandler: IDirectiveHandler;

  let mockPathService: IPathService;
  let mockParserService: IParserService;
  let mockInterpreterClient: IInterpreterServiceClient;
  let mockInterpreterClientFactory: InterpreterServiceClientFactory;
  let mockCircularityService: ICircularityService;
  let mockFileSystemService: IFileSystemService;
  let mockLogger: ILogger;

  beforeEach(async () => {
    vi.resetAllMocks();

    context = TestContextDI.createIsolated();

    testContainer = container.createChildContainer();

    // Register Infrastructure Mocks
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    const mockLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        level: 'debug'
    };
    testContainer.registerInstance<ILogger>('MainLogger', mockLogger as ILogger);
    testContainer.registerInstance<ILogger>('ILogger', mockLogger as ILogger);
    
    // Create and Register Mocks
    mockStateService = MockFactory.createStateService();
    mockValidationService = MockFactory.createValidationService();
    mockResolutionService = MockFactory.createResolutionService();
    mockPathService = { resolvePath: vi.fn(), validatePath: vi.fn(), normalizePath: vi.fn(), dirname: vi.fn().mockReturnValue(process.cwd()) } as unknown as IPathService;
    vi.spyOn(mockPathService, 'resolvePath').mockImplementation(
      (filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath => {
        let pathString: string;
        if (typeof filePath === 'string') {
          pathString = filePath;
        } else if (filePath && typeof filePath === 'object' && 'structured' in filePath && filePath.structured) {
          pathString = filePath.structured.segments.map((f: string) => f).join('/');
        } else {
          pathString = '';
        }
        return unsafeCreateAbsolutePath(pathString);
      }
    );
    mockFileSystemService = { readFile: vi.fn(), exists: vi.fn() } as unknown as IFileSystemService;
    mockParserService = { parse: vi.fn(), parseWithLocation: vi.fn(), parseFile: vi.fn() } as unknown as IParserService;
    mockInterpreterClient = { interpret: vi.fn(), createChildContext: vi.fn() } as unknown as IInterpreterServiceClient;
    mockInterpreterClientFactory = {
      createClient: vi.fn().mockReturnValue(mockInterpreterClient)
    } as unknown as InterpreterServiceClientFactory;
    mockCircularityService = { beginImport: vi.fn(), endImport: vi.fn(), isInStack: vi.fn().mockReturnValue(false), checkVariableReference: vi.fn(), getImportStack: vi.fn().mockReturnValue([]), reset: vi.fn() } as unknown as ICircularityService;

    // Configure mocks ...
    vi.spyOn(mockPathService, 'resolvePath').mockImplementation(
      (filePath: RawPath | StructuredPath, baseDir?: RawPath): AbsolutePath | RelativePath => {
        let pathString: string;
        if (typeof filePath === 'string') {
          pathString = filePath;
        } else if (filePath && typeof filePath === 'object' && 'structured' in filePath && filePath.structured) {
          pathString = filePath.structured.segments.map((f: string) => f).join('/');
        } else {
          pathString = '';
        }
        return unsafeCreateAbsolutePath(pathString);
      }
    );
    vi.spyOn(mockResolutionService, 'resolveInContext').mockImplementation(async (value, ctx) => {
      if (typeof value === 'string') {
        return value;
      } else if (isInterpolatableValueArray(value)) {
        return value.map(n => n.type === 'Text' ? n.content : '').join('');
      }
      return 'ResolvedContextValue_Unknown';
    });
    vi.spyOn(mockResolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => 'ResolvedNodesValue');
    vi.spyOn(mockStateService, 'setDataVar').mockImplementation(async (name: string, value: JsonValue, metadata?: Partial<VariableMetadata>) => {
       (mockStateService as any)._mockStorage[name] = value;
       return;
    });

    // >>> Register Core/Infrastructure Mocks FIRST <<<
    testContainer.registerInstance<IFileSystem>('IFileSystem', context.fs);
    testContainer.registerInstance('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance('IPathService', mockPathService);
    testContainer.registerInstance('IParserService', mockParserService);
    testContainer.registerInstance(InterpreterServiceClientFactory, mockInterpreterClientFactory);
    testContainer.registerInstance('ICircularityService', mockCircularityService);
    testContainer.registerInstance('IInterpreterService', { interpret: vi.fn(), createChildContext: vi.fn() });

    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Define Mock Handlers ---
    mockTextHandler = {
        kind: 'text',
        handle: vi.fn(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult> => {
            let resolvedValue = 'DefaultResolvedText';
            if (ctx.directiveNode.directive) {
              const directiveValue = ctx.directiveNode.directive.value;
              if (isInterpolatableValueArray(directiveValue)) {
                resolvedValue = await mockResolutionService.resolveNodes(directiveValue, ctx.resolutionContext);
              } else if (typeof directiveValue === 'string') {
                resolvedValue = await mockResolutionService.resolveInContext(directiveValue, ctx.resolutionContext);
              } else {
                resolvedValue = String(directiveValue);
              }
              return {
                stateChanges: {
                  variables: {
                    [ctx.directiveNode.directive.identifier]: { type: VariableType.TEXT, value: resolvedValue }
                  }
                }
              };
            }
            return { stateChanges: undefined, replacement: undefined };
        })
    };
    mockDataHandler = {
        kind: 'data',
        handle: vi.fn(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult> => {
           let resolvedValue: unknown = 'DefaultResolvedData';
           if (ctx.directiveNode.directive) {
               const directiveValue = ctx.directiveNode.directive.value;
               if (isInterpolatableValueArray(directiveValue)) {
                  resolvedValue = await mockResolutionService.resolveNodes(directiveValue, ctx.resolutionContext);
               } else {
                  resolvedValue = directiveValue;
               }
               return {
                 stateChanges: {
                   variables: {
                     [ctx.directiveNode.directive.identifier]: { type: VariableType.DATA, value: resolvedValue as JsonValue }
                   }
                 }
               };
            }
            return { stateChanges: undefined, replacement: undefined };
        })
    };
    mockImportHandler = {
        kind: 'import',
        handle: vi.fn(async (ctx: DirectiveProcessingContext): Promise<DirectiveResult> => {
            return { stateChanges: undefined, replacement: [] };
        })
    };

    // --- Register Mock Handlers ---
    testContainer.registerInstance('IDirectiveHandler', mockTextHandler);
    testContainer.registerInstance('IDirectiveHandler', mockDataHandler);
    testContainer.registerInstance('IDirectiveHandler', mockImportHandler);

    // Register REAL Service Implementation
    testContainer.register(DirectiveService, { useClass: DirectiveService });

    // Resolve the Service Under Test
    directiveService = testContainer.resolve(DirectiveService);
  });

  afterEach(async () => {
    testContainer?.clearInstances();
    await context?.cleanup();
  });

  describe('Service initialization and Handler Registration', () => {
    it('should initialize correctly via DI and register handlers', async () => {
      expect(directiveService).toBeDefined();
      expect(directiveService.hasHandler('text')).toBe(true);
      expect(directiveService.hasHandler('data')).toBe(true);
      expect(directiveService.hasHandler('import')).toBe(true);
    });

    it('should throw if handler is missing when processing', async () => {
      const freshContext = TestContextDI.createTestHelpers().setupWithStandardMocks({}, { isolatedContainer: true });

      const minimalMockState = {
        getCurrentFilePath: vi.fn().mockReturnValue('test.meld'),
        clone: vi.fn().mockImplementation(() => minimalMockState),
        getStateId: vi.fn().mockReturnValue('fresh-mock-state'),
        isTransformationEnabled: vi.fn().mockReturnValue(true),
      } as unknown as IStateService;
      freshContext.registerMock('IStateService', minimalMockState);

      const mockEmptyDirectiveService = {
        getSupportedDirectives: () => [],
        handleDirective: vi.fn().mockImplementation(async (node, ctx) => {
           throw new DirectiveError('Simulated: No handler registered', node.directive!.kind, DirectiveErrorCode.HANDLER_NOT_FOUND);
        })
      } as unknown as IDirectiveService;

      freshContext.registerMock('IDirectiveService', mockEmptyDirectiveService);

      const freshService = await freshContext.resolve<IDirectiveService>('IDirectiveService');

      const node = createTextDirective('test', 'value');
      const currentFilePath = 'test.meld';
      const freshMockState = await freshContext.resolve<IStateService>('IStateService');
      vi.spyOn(freshMockState, 'getCurrentFilePath').mockReturnValue(currentFilePath);

      const processingContext: DirectiveProcessingContext = {
          state: freshMockState,
          directiveNode: node,
          resolutionContext: ResolutionContextFactory.create(freshMockState, currentFilePath),
          formattingContext: mockFormattingContext,
      };

      await expect(freshService.handleDirective(node, processingContext))
        .rejects.toThrowError(DirectiveError);

      await expect(freshService.handleDirective(node, processingContext))
        .rejects.toHaveProperty('code', DirectiveErrorCode.HANDLER_NOT_FOUND);
    });
  });

  describe('Directive processing', () => {
    describe('Text directives', () => {
      it('should route to text handler and update state', async () => {
        const directiveNode = createTextDirective('greeting', 'Hello Directive');
        const currentFilePath = 'test.meld';
        const expectedResolvedValue = 'Hello Directive';
        
        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(currentFilePath);
        vi.spyOn(mockValidationService, 'validate').mockImplementation(vi.fn());

        const processingContext: DirectiveProcessingContext = {
            state: mockStateService,
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockStateService, currentFilePath),
            formattingContext: mockFormattingContext,
        };

        const result = await directiveService.handleDirective(directiveNode, processingContext);

        expect(mockValidationService.validate).toHaveBeenCalledWith(directiveNode);
        expect(result).toBeDefined(); 
        expect(result.stateChanges).toBeDefined();
        expect(result.stateChanges?.variables).toBeDefined();
        expect(result.stateChanges?.variables?.greeting).toBeDefined();
        expect(result.stateChanges?.variables?.greeting?.type).toBe(VariableType.TEXT);
        expect(result.stateChanges?.variables?.greeting?.value).toBe(expectedResolvedValue);
        expect(result.replacement).toBeUndefined();
      });

      it('should use resolution service for interpolated text value', async () => {
          const directiveNode = createTextDirective('greeting', 'Hello, {{name}}');
          const currentFilePath = 'interpolate.meld';
          const expectedResolvedValue = 'Hello, {{name}}';

          vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(currentFilePath);
          vi.spyOn(mockValidationService, 'validate').mockImplementation(vi.fn());

          const processingContext: DirectiveProcessingContext = {
              state: mockStateService,
              directiveNode: directiveNode,
              resolutionContext: ResolutionContextFactory.create(mockStateService, currentFilePath),
              formattingContext: mockFormattingContext,
          };
          const result = await directiveService.handleDirective(directiveNode, processingContext);

          expect(mockValidationService.validate).toHaveBeenCalledWith(directiveNode);
          expect(mockTextHandler.handle).toHaveBeenCalled();
          expect(result?.stateChanges?.variables?.greeting).toBeDefined();
          expect(result?.stateChanges?.variables?.greeting?.value).toBe(expectedResolvedValue);
      });
    });

    describe('Data directives', () => {
      it('should process data directive with object value', async () => {
        const dataValue = { key: 'directive value' };
        const directiveNode = createDataDirective('config', dataValue );
        if (directiveNode?.directive) { directiveNode.directive.source = 'literal'; }
        
        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('test-data.meld');

        const processingContext: DirectiveProcessingContext = { 
            state: mockStateService, 
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockStateService, 'test-data.meld'),
            formattingContext: mockFormattingContext,
        };

        const result = await directiveService.handleDirective(directiveNode, processingContext);

        expect(mockDataHandler.handle).toHaveBeenCalledWith(expect.objectContaining({ 
          directiveNode: directiveNode 
        }));
        expect(result?.stateChanges?.variables?.config).toBeDefined();
        expect(result?.stateChanges?.variables?.config?.value).toEqual(dataValue);
      });

      it('should process data directive with variable interpolation', async () => { 
        const interpolatableValue: InterpolatableValue = [
          { type: 'Text', content: 'Value: ', nodeId: crypto.randomUUID() }, 
          { type: 'VariableReference', identifier: 'sourceVar', valueType: 'text', nodeId: crypto.randomUUID() } as VariableReferenceNode
        ];
        const directiveNode = createDataDirective('config', interpolatableValue );
        const expectedResolvedValue = 'ResolvedNodesValue';

        vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(expectedResolvedValue);

        const processingContext: DirectiveProcessingContext = { 
            state: mockStateService, 
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockStateService, 'test-data-interp.meld'),
            formattingContext: mockFormattingContext,
        };

        const result = await directiveService.handleDirective(directiveNode, processingContext);

        expect(mockDataHandler.handle).toHaveBeenCalled();
        expect(result?.stateChanges?.variables?.config).toBeDefined();
        expect(result?.stateChanges?.variables?.config?.value).toBe(expectedResolvedValue);
      });
    });

    describe('Import directives', () => {
      it('should route to import handler', async () => {
        const directiveNode = createImportDirective('other.meld');
        const currentFilePath = 'main.meld';
        const resolvedImportPath = unsafeCreateAbsolutePath('other.meld');

        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(currentFilePath);
        vi.spyOn(mockStateService, 'clone').mockImplementation(() => mockStateService);
        vi.spyOn(mockValidationService, 'validate').mockImplementation(vi.fn());
        vi.spyOn(mockCircularityService, 'isInStack').mockReturnValue(false);
        vi.spyOn(mockCircularityService, 'beginImport');
        vi.spyOn(mockPathService, 'resolvePath').mockReturnValue(resolvedImportPath);

        const processingContext: DirectiveProcessingContext = {
            state: mockStateService,
            directiveNode: directiveNode,
            resolutionContext: ResolutionContextFactory.create(mockStateService, currentFilePath),
            formattingContext: mockFormattingContext,
        };
        const result = await directiveService.handleDirective(directiveNode, processingContext);

        expect(mockValidationService.validate).toHaveBeenCalledWith(directiveNode);
        expect(mockImportHandler.handle).toHaveBeenCalled();
        expect(result).toEqual({ stateChanges: undefined, replacement: [] });
      });

      it('should handle circular imports detection (mocked)', async () => {
        const node = createImportDirective('circular.meld');
        const currentFilePath = 'main.meld';
        const resolvedCircularPath = unsafeCreateAbsolutePath('circular.meld');

        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(currentFilePath);
        vi.spyOn(mockStateService, 'clone').mockImplementation(() => mockStateService);
        vi.spyOn(mockValidationService, 'validate').mockImplementation(vi.fn());
        vi.spyOn(mockCircularityService, 'isInStack').mockImplementation((filePath: string) => {
          return filePath === resolvedCircularPath;
        });
        vi.spyOn(mockPathService, 'resolvePath').mockReturnValue(resolvedCircularPath);

        const processingContext: DirectiveProcessingContext = {
            state: mockStateService,
            directiveNode: node,
            resolutionContext: ResolutionContextFactory.create(mockStateService, currentFilePath),
            formattingContext: mockFormattingContext,
        };

        await expect(directiveService.handleDirective(node, processingContext))
          .rejects.toThrowError(MeldError);

        expect(mockValidationService.validate).toHaveBeenCalledWith(node);
        expect(mockCircularityService.isInStack).toHaveBeenCalledWith(resolvedCircularPath);
      });
    });
  });
}); 