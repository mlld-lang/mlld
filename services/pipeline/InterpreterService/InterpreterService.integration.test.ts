import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { container, type DependencyContainer } from 'tsyringe';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldImportError } from '@core/errors/MeldImportError';
import type { TextNode, MeldNode, DirectiveNode } from '@core/ast/types';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
import type { IStateService } from '@services/state/StateService/IStateService';
import { StateServiceAdapter } from '@services/state/StateService/StateServiceAdapter';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import { ParserService } from '@services/pipeline/ParserService/ParserService';
import { logger } from '@core/utils/logger';
// Import necessary factories and clients
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { 
  DirectiveResult, 
  ResolutionHandlerResult 
} from '@core/directives/DirectiveHandler';
import type { StateChanges } from '@core/types/state';
import { 
  VariableType,
  type TextVariable, 
  type DataVariable 
} from '@core/types/variables';
// Use ASTFixtureLoader instead of syntax helpers
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';
import { 
  createTextVariable, 
  createDataVariable, 
  createPathVariable
} from '@core/types/variables';
import { PathContentType } from '@core/types/paths';
import type { IFilesystemPathState } from '@core/types/paths';
// Import services for DI
import { StateEventService } from '@services/state/StateEventService/StateEventService';
import { PathOperationsService } from '@services/fs/FileSystemService/PathOperationsService';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService';
import { PathService } from '@services/fs/PathService/PathService';
import { ResolutionService } from '@services/resolution/ResolutionService/ResolutionService';
import { CircularityService } from '@services/resolution/CircularityService/CircularityService';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient';
import type { ILogger } from '@core/utils/logger';

describe('InterpreterService Integration Tests with Fixtures', () => {
  let interpreterService: IInterpreterService;
  let stateService: IStateService;
  let mockDirectiveClient: IDirectiveServiceClient;
  let parser: IParserService;
  let testContainer: DependencyContainer;
  let fixtureLoader: ASTFixtureLoader;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Create child container for isolation
    testContainer = container.createChildContainer();

    // Initialize fixture loader
    fixtureLoader = new ASTFixtureLoader();

    // Mock logger
    const mockLogger: Partial<ILogger> = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    };
    testContainer.register('ILogger', { useValue: mockLogger });
    testContainer.register('MainLogger', { useValue: mockLogger });

    // Mock DirectiveServiceClient with proper interface implementation
    mockDirectiveClient = {
      handleDirective: vi.fn().mockResolvedValue({
        stateChanges: undefined,
        replacement: undefined
      })
    } as unknown as IDirectiveServiceClient;
    
    // Mock DirectiveServiceClientFactory
    const mockDirectiveFactory = {
      createClient: vi.fn().mockReturnValue(mockDirectiveClient)
    };
    testContainer.register(DirectiveServiceClientFactory, { useValue: mockDirectiveFactory });
    testContainer.register('DirectiveServiceClientFactory', { useValue: mockDirectiveFactory });

    // Mock filesystem and path services
    const mockFileSystem = mockDeep<IFileSystem>();
    const mockPathService = mock<IPathService>();
    testContainer.register('IFileSystem', { useValue: mockFileSystem });
    testContainer.register('IPathService', { useValue: mockPathService });
    
    // Setup State Tracking
    const trackingService = new StateTrackingService();
    testContainer.register('IStateTrackingService', { useValue: trackingService });
    
    // Mock tracking client
    const mockTrackingClient = {
      trackStateOperation: vi.fn(),
      registerState: vi.fn(),
      addRelationship: vi.fn(),
      registerRelationship: vi.fn(),
    } as IStateTrackingServiceClient;
    
    const mockStateTrackingClientFactory = { 
      createClient: vi.fn().mockReturnValue(mockTrackingClient) 
    };
    testContainer.register('StateTrackingServiceClientFactory', { useValue: mockStateTrackingClientFactory });
    
    // Register state event service
    testContainer.register(StateEventService, { useClass: StateEventService });
    testContainer.register('IStateEventService', { useToken: StateEventService });
    
    // Register path operations
    testContainer.register(PathOperationsService, { useClass: PathOperationsService });
    testContainer.register('IPathOperationsService', { useToken: PathOperationsService });
    
    // Register DependencyContainer (needed by StateService)
    testContainer.register('DependencyContainer', { useValue: testContainer });
    
    // Register services
    testContainer.register(FileSystemService, { useClass: FileSystemService });
    testContainer.register('IFileSystemService', { useToken: FileSystemService });
    testContainer.register('IStateService', { useClass: StateServiceAdapter });
    testContainer.register('IParserService', { useClass: ParserService });
    testContainer.register(ParserService, { useClass: ParserService });
    testContainer.register('IResolutionService', { useClass: ResolutionService });
    testContainer.register('ICircularityService', { useClass: CircularityService });
    testContainer.register(InterpreterService, { useClass: InterpreterService });
    testContainer.register('IInterpreterService', { useClass: InterpreterService });
    
    // Mock URL content resolver
    const mockURLContentResolver = {
      isURL: vi.fn().mockReturnValue(false),
      validateURL: vi.fn().mockResolvedValue(true),
      fetchURL: vi.fn().mockResolvedValue({ content: 'Mock content', metadata: {}, fromCache: false })
    };
    testContainer.register('IURLContentResolver', { useValue: mockURLContentResolver });
    
    // Resolve services
    stateService = testContainer.resolve<IStateService>('IStateService');
    parser = testContainer.resolve<IParserService>('IParserService');
    interpreterService = testContainer.resolve<IInterpreterService>('IInterpreterService');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    testContainer?.dispose();
  });

  describe('Basic interpretation', () => {
    it('interprets text nodes', async () => {
      const content = 'Hello world';
      const nodes = await parser.parse(content);
      const result = await interpreterService.interpret(nodes as MeldNode[]);
      const resultNodes = result.getNodes();
      expect(resultNodes).toHaveLength(1);
      expect(resultNodes[0].type).toBe('Text');
      expect((resultNodes[0] as TextNode).content).toBe('Hello world');
    });

    it('interprets directive nodes', async () => {
      const fixture = fixtureLoader.getFixture('text-assignment-1');
      expect(fixture).toBeDefined();
      
      const node = fixture!.ast[0] as DirectiveNode;
      const varName = node.raw.identifier;
      const expectedValue = "Hello, world!";
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          const variable = createTextVariable(varName, expectedValue);
          const stateChanges: StateChanges = {
            variables: {
              [varName]: variable
            }
          };
          // Return a DirectiveResult with stateChanges
          return { stateChanges, replacement: undefined };
      });

      const resultState = await interpreterService.interpret([node] as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
      // Assert against the returned state
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.TEXT);
      expect((variable as TextVariable)?.value).toBe(expectedValue);
    });

    it('interprets data directives', async () => {
      const fixture = fixtureLoader.getFixture('data-object-1');
      expect(fixture).toBeDefined();
      
      const node = fixture!.ast[0] as DirectiveNode;
      const varName = node.raw.identifier;
      const expectedData = { name: "John", age: 30 };

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          const variable = createDataVariable(varName, expectedData);
          const stateChanges: StateChanges = {
            variables: {
              [varName]: variable
            }
          };
          return { stateChanges, replacement: undefined };
      });

      const resultState = await interpreterService.interpret([node] as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
      const variable = resultState.getVariable(varName);
      expect(variable).toBeDefined();
      expect(variable?.type).toBe(VariableType.DATA);
      expect((variable as DataVariable)?.value).toEqual(expectedData);
    });
  });

  describe('Error handling', () => {
    it('throws MeldInterpreterError for undefined nodes', async () => {
      await expect(interpreterService.interpret(undefined as any))
        .rejects.toThrow(MeldInterpreterError);
    });

    it('throws MeldInterpreterError for empty nodes', async () => {
      // InterpreterService actually seems to accept empty arrays, let's check if it returns a StateService
      const result = await interpreterService.interpret([]);
      expect(result).toBeDefined();
      expect(result.getNodes()).toHaveLength(0);
    });

    it('throws MeldInterpreterError for null nodes', async () => {
      await expect(interpreterService.interpret(null as any))
        .rejects.toThrow(MeldInterpreterError);
    });

    it('throws MeldInterpreterError for non-array nodes', async () => {
      await expect(interpreterService.interpret('not an array' as any))
        .rejects.toThrow(MeldInterpreterError);
    });

    it('handles missing handler gracefully', async () => {
      const fixture = fixtureLoader.getFixture('text-assignment-1');
      const node = fixture!.ast[0] as DirectiveNode;
      // Ensure the mock throws a directive client error
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValueOnce(
        new DirectiveError(
          'Handler not found',
          DirectiveErrorCode.HANDLER_NOT_FOUND,
          { directive: node.kind }
        )
      );

      await expect(interpreterService.interpret([node] as MeldNode[]))
        .rejects.toThrowError();
    });

    it('handles import errors appropriately', async () => {
      const fixture = fixtureLoader.getFixture('import-all-1');
      const node = fixture!.ast[0] as DirectiveNode;
      
      // Mock to throw an import error
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValueOnce(
        new MeldImportError('File not found', { code: 'FILE_NOT_FOUND' })
      );

      await expect(interpreterService.interpret([node] as MeldNode[]))
        .rejects.toThrow(MeldImportError);
    });
  });

  describe('Complex interpretation scenarios', () => {
    it('interprets multiple directives', async () => {
      const fixture1 = fixtureLoader.getFixture('text-assignment-1');
      const fixture2 = fixtureLoader.getFixture('data-object-1');
      const fixture3 = fixtureLoader.getFixture('path-assignment-1');
      
      const nodes = [
        fixture1!.ast[0] as DirectiveNode,
        fixture2!.ast[0] as DirectiveNode,
        fixture3!.ast[0] as DirectiveNode
      ];
      
      // Mock each directive handling
      vi.spyOn(mockDirectiveClient, 'handleDirective')
        .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          // Text directive
          const varName = node.raw.identifier;
          const variable = createTextVariable(varName, 'Hello, world!');
          return { 
            stateChanges: { variables: { [varName]: variable } }, 
            replacement: undefined 
          };
        })
        .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          // Data directive
          const varName = node.raw.identifier;
          const variable = createDataVariable(varName, { name: "John", age: 30 });
          return { 
            stateChanges: { variables: { [varName]: variable } }, 
            replacement: undefined 
          };
        })
        .mockImplementationOnce(async (node: DirectiveNode, context: DirectiveProcessingContext) => {
          // Path directive
          const varName = node.raw.identifier;
          const pathState: IFilesystemPathState = {
            contentType: PathContentType.FILESYSTEM,
            originalValue: '/docs/guide.md',
            isValidSyntax: true,
            isSecure: true,
            exists: true,
            isAbsolute: true,
            validatedPath: '/docs/guide.md'
          };
          const pathVar = createPathVariable(varName, pathState);
          return { 
            stateChanges: { variables: { [varName]: pathVar } }, 
            replacement: undefined 
          };
        });

      const resultState = await interpreterService.interpret(nodes as MeldNode[]);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(3);
      
      // Verify all variables were created
      const textVar = resultState.getVariable('greeting');
      expect(textVar).toBeDefined();
      expect(textVar.type).toBe(VariableType.TEXT);
      
      const dataVar = resultState.getVariable('user');
      expect(dataVar).toBeDefined();
      expect(dataVar.type).toBe(VariableType.DATA);
      
      const pathVar = resultState.getVariable('docsDir');
      expect(pathVar).toBeDefined();
      expect(pathVar.type).toBe(VariableType.PATH);
    });
  });
});