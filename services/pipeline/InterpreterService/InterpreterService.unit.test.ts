#!/usr/bin/env node
import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode, VariableReferenceNode } from '@core/syntax/types/index.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createTextNode, createDirectiveNode, createLocation, createVariableReferenceNode } from '@tests/utils/testFactories.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService, IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { VariableType, type CommandVariable, type TextVariable, type JsonValue } from '@core/types/index.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { InterpreterTestFixture } from '@tests/utils/fixtures/InterpreterTestFixture.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { container, type DependencyContainer } from 'tsyringe';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { mock, mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { OutputFormattingContext, DirectiveProcessingContext } from '@core/types/index.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { AbsolutePath, RelativePath, unsafeCreateAbsolutePath } from '@core/types/paths.js';
import { ILogger } from '@core/utils/logger';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import type { IVariableReferenceResolverClient } from '@services/resolution/ResolutionService/interfaces/IVariableReferenceResolverClient.js';
import type { ResolutionContext, ResolutionFlags } from '@core/types/resolution.js';

// Define a minimal logger interface for testing
interface ITestLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  trace: Mock;
  level: string;
}

// Helper function to create mock handlers
const createMockHandler = (kind: string): IDirectiveHandler => ({
    kind: kind,
    // Corrected handle signature
    handle: vi.fn().mockImplementation(async (node: DirectiveNode, ctx: DirectiveProcessingContext): Promise<DirectiveResult> => {
      const stateChanges: StateChanges = { variables: { [`${kind}Processed`]: { type: VariableType.TEXT, value: 'handled' } } };
      return { stateChanges, replacement: undefined };
    })
});

describe('InterpreterService Unit', () => {
  let testContainer: DependencyContainer;
  let service: InterpreterService;
  let mockStateService: IStateService;
  let mockResolutionService: IResolutionService;
  let mockParserClient: IParserServiceClient;
  let mockParserClientFactory: ParserServiceClientFactory;
  let mockDirectiveClient: IDirectiveServiceClient;
  let mockDirectiveClientFactory: DirectiveServiceClientFactory;
  let mockPathService: IPathService;
  let mockLogger: ITestLogger;
  let mockFileSystemService: IFileSystemService;
  let mockCircularityService: ICircularityService;
  let mockResolutionContextFactory: ResolutionContextFactory;

  beforeEach(async () => {
    vi.resetAllMocks();
    testContainer = container.createChildContainer();

    // --- Create Mocks ---
    mockLogger = { 
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        level: 'info' 
    } as unknown as ITestLogger; // Cast needed for non-standard logger mock
    
    // Use object literal with vi.fn() for ResolutionService mock
    mockResolutionService = {
      resolveInContext: vi.fn(),
      resolveNodes: vi.fn(),
      // Add other IResolutionService methods if needed by tests later
    } as unknown as IResolutionService;
    
    // Linter Fix: Use object literal for path service mock
    mockPathService = { 
      dirname: vi.fn(),
      // Add other IPathService methods if needed by tests later, e.g.:
      // resolvePath: vi.fn(),
      // normalizePath: vi.fn(),
      // validatePath: vi.fn(),
      // getPathInfo: vi.fn(),
    } as unknown as IPathService;
    // Linter Fix: Use object literal with vi.fn() for state service mock
    mockStateService = { 
      clone: vi.fn(),
      createChildState: vi.fn(),
      addNode: vi.fn(),
      setVariable: vi.fn(),
      getVariable: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommandVar: vi.fn(),
      getAllTextVars: vi.fn().mockReturnValue(new Map()),
      getAllDataVars: vi.fn().mockReturnValue(new Map()),
      getAllPathVars: vi.fn().mockReturnValue(new Map()),
      getAllCommands: vi.fn().mockReturnValue(new Map()),
      getCurrentFilePath: vi.fn(),
      setCurrentFilePath: vi.fn(),
      isTransformationEnabled: vi.fn(),
      setTransformationEnabled: vi.fn(),
      getStateId: vi.fn(),
      getNodes: vi.fn(),
      getTransformedNodes: vi.fn(),
      mergeChildState: vi.fn(),
      transformNode: vi.fn(),
      hasTransformationSupport: vi.fn().mockReturnValue(true), // Add missing method
    } as unknown as IStateService; // Cast to satisfy type, spies will be set later

    // Mock Clients - Use object literals with vi.fn()
    mockDirectiveClient = { 
      handleDirective: vi.fn(),
      supportsDirective: vi.fn().mockReturnValue(true) // Include other methods if needed
    } as unknown as IDirectiveServiceClient;
    // Use object literal with vi.fn() for ParserClient mock
    mockParserClient = {
        parseString: vi.fn(),
        // Add other IParserServiceClient methods if needed
    } as unknown as IParserServiceClient;

    // Mock Factories to return Mock Clients - Use object literals with vi.fn()
    mockDirectiveClientFactory = { 
      createClient: vi.fn().mockReturnValue(mockDirectiveClient)
    } as unknown as DirectiveServiceClientFactory;
    // vi.spyOn(mockDirectiveClientFactory, 'createClient').mockReturnValue(mockDirectiveClient);
    
    mockParserClientFactory = { 
      createClient: vi.fn().mockReturnValue(mockParserClient)
    } as unknown as ParserServiceClientFactory;
    // vi.spyOn(mockParserClientFactory, 'createClient').mockReturnValue(mockParserClient);

    // Add Mocks for other potential dependencies
    mockFileSystemService = {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      // Add other IFileSystemService methods if needed
    } as unknown as IFileSystemService;

    mockCircularityService = {
      startProcessing: vi.fn(),
      finishProcessing: vi.fn(),
      isCircular: vi.fn().mockReturnValue(false),
      // Add other ICircularityService methods if needed
    } as unknown as ICircularityService;

    // Mock ResolutionContextFactory (Manual Object + Spy)
    mockResolutionContextFactory = { 
      createContext: vi.fn().mockImplementation((options?: Partial<ResolutionContext>): ResolutionContext => {
        // Create a base mock context satisfying the interface
        const baseContext: ResolutionContext = {
          state: options?.state ?? mockStateService, // Use provided or default mock state
          strict: options?.strict ?? false,
          depth: options?.depth ?? 0,
          flags: {
            isVariableEmbed: false,
            isTransformation: false,
            allowRawContentResolution: false,
            isDirectiveHandler: false,
            isImportContext: false,
            processNestedVariables: true,
            preserveUnresolved: false,
            ...(options?.flags ?? {}), // Merge flags from options
          },
          currentFilePath: options?.currentFilePath ?? undefined,
          formattingContext: options?.formattingContext ?? undefined,
          pathContext: options?.pathContext ?? undefined,
          parserFlags: options?.parserFlags ?? undefined,
          allowedVariableTypes: options?.allowedVariableTypes ?? undefined,

          // Implement context modification methods (can return 'this' for simple mocks)
          withIncreasedDepth: vi.fn().mockReturnThis(),
          withStrictMode: vi.fn().mockReturnThis(),
          withAllowedTypes: vi.fn().mockReturnThis(),
          withFlags: vi.fn().mockReturnThis(),
          withFormattingContext: vi.fn().mockReturnThis(),
          withPathContext: vi.fn().mockReturnThis(),
          withParserFlags: vi.fn().mockReturnThis(),
        };
        // Note: For more complex tests, the 'with*' methods might need
        // to return new objects with the specific changes.
        return baseContext;
      }),
      // Add other methods of ResolutionContextFactory if they exist and are needed
    } as ResolutionContextFactory; // Cast the whole mock object to the class type

    // Spy AFTER object creation - CAST TO ANY to bypass type error
    vi.spyOn(mockResolutionContextFactory as any, 'createContext');

    // --- Create Manual Container & Register Mocks ---
    testContainer.registerInstance<ILogger>('ILogger', mockLogger);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<DirectiveServiceClientFactory>(DirectiveServiceClientFactory, mockDirectiveClientFactory);
    testContainer.registerInstance<ParserServiceClientFactory>(ParserServiceClientFactory, mockParserClientFactory);
    
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<ICircularityService>('ICircularityService', mockCircularityService);
    // Register the manual mock instance using Class token
    testContainer.registerInstance(ResolutionContextFactory, mockResolutionContextFactory);
    
    testContainer.registerInstance('DependencyContainer', testContainer); 

    // --- Register the REAL service implementation ---
    testContainer.register(InterpreterService, { useClass: InterpreterService });

    // --- Resolve Service from Manual Container ---
    service = testContainer.resolve(InterpreterService);

    // --- Setup Default Mock Behaviors (on the mocks registered above) ---
    vi.spyOn(mockStateService, 'clone').mockReturnValue(mockStateService); // Return self for chaining simplicity in tests
    vi.spyOn(mockStateService, 'createChildState').mockReturnValue(mockStateService); // Return self
    vi.spyOn(mockStateService, 'isTransformationEnabled').mockReturnValue(false);
    vi.spyOn(mockStateService, 'addNode');
    vi.spyOn(mockStateService, 'getNodes').mockReturnValue([]);
    vi.spyOn(mockStateService, 'getTransformedNodes').mockReturnValue([]);
    vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(null);
    vi.spyOn(mockPathService, 'dirname').mockReturnValue('.'); 
    
    // Setup default behavior for the CLIENT's handleDirective
    vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: [] });
    
    // Spy on mockResolutionContextFactory.createContext is done above
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('initializes correctly via fixture', () => {
      expect(service).toBeDefined();
      expect(service.interpret).toBeDefined();
    });
  });

  describe('node interpretation', () => {
    beforeEach(() => {
        // Reset mocks/spies specific to this block if necessary
        // vi.mocked(mockDirectiveService.handleDirective).mockReset(); // REMOVE - Spying on client now
        vi.mocked(mockDirectiveClient.handleDirective).mockClear(); // Clear calls on the client mock
        vi.mocked(mockStateService.addNode).mockClear();
        vi.mocked(mockStateService.setVariable).mockClear(); // Keep if needed
        vi.mocked(mockParserClient.parseString).mockClear();
        vi.mocked(mockResolutionService.resolveNodes).mockClear();

        // Re-apply default behaviors if needed (usually not necessary if outer beforeEach is sufficient)
        // vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: undefined });
        vi.spyOn(mockStateService, 'clone').mockReturnValue(mockStateService);
        vi.spyOn(mockStateService, 'addNode');
        vi.spyOn(mockStateService, 'isTransformationEnabled').mockReturnValue(false);
    });

    it('processes text nodes by adding to working state', async () => {
      const textNode: TextNode = createTextNode('Test content');
      
      // Use the mockStateService from beforeEach as the initial state
      // Spies are already configured on it in beforeEach
      const initialTestState = mockStateService;
      const workingState = mockStateService; // createChildState mock returns itself

      // Ensure spies are active (redundant if beforeEach is correct, but safe)
      vi.spyOn(initialTestState, 'createChildState'); 
      vi.spyOn(workingState, 'addNode'); 
      // vi.spyOn(workingState, 'clone'); // clone is already spied on in outer beforeEach

      const finalState = await service.interpret([textNode], { initialState: initialTestState });

      // FIX: Expect clone 4 times (init current, init snapshot, applyStateChanges, update lastGoodState)
      expect(initialTestState.clone).toHaveBeenCalledTimes(4); 
      expect(workingState.addNode).toHaveBeenCalledWith(textNode);
      expect(finalState).toBe(workingState); // Should return the working state (which is the clone)
    });

    it('processes directive nodes by calling directiveService.handleDirective client', async () => {
      const directiveNode: DirectiveNode = createDirectiveNode('text', { identifier: 'test', value: 'value' });
      const initialTestState = mockStateService;
      vi.spyOn(initialTestState, 'createChildState').mockReturnValue(mockStateService);
      vi.spyOn(initialTestState, 'clone').mockReturnValue(mockStateService);
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: [] });
      vi.mocked(mockDirectiveClient.handleDirective).mockClear();
      vi.mocked(initialTestState.createChildState).mockClear();
      vi.mocked(initialTestState.clone).mockClear();
      await service.interpret([directiveNode], { initialState: initialTestState });
      
      // FIX: Expect clone 4 times (init current, init snapshot, applyStateChanges, update lastGoodState)
      expect(initialTestState.clone).toHaveBeenCalledTimes(4); 
      
      // Assert call on the *client* mock (mockDirectiveClient from beforeEach)
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ state: mockStateService, directiveNode: directiveNode })
      );
    });

    it('throws MeldInterpreterError when directive service fails', async () => {
      // Provide a valid node for the text handler to avoid premature validation errors
      const directiveNode: DirectiveNode = createDirectiveNode('text', { identifier: 'fail_id', value: 'fail-value' });
      const handlerError = new Error('Handler Test error');
      // Ensure the spy/rejection is set up correctly on the mock client instance
      vi.mocked(mockDirectiveClient.handleDirective).mockRejectedValue(handlerError);
      
      // Use mockStateService from beforeEach as initial state
      await expect(service.interpret([directiveNode], { initialState: mockStateService }))
            .rejects.toThrow(MeldInterpreterError);
      // Check the cause property specifically
      await expect(service.interpret([directiveNode], { initialState: mockStateService }))
            .rejects.toHaveProperty('cause', handlerError);
    });

    it('extracts error location from node when error occurs in handler client', async () => {
        const location = createLocation(5, 10, 5, 20);
        // Provide a valid node for the text handler
        const directiveNode: DirectiveNode = createDirectiveNode('text', { identifier: 'loc_fail_id', value: 'loc-fail-value' }, location);
        const testError = new Error('Handler loc Test error');
        // Ensure the spy/rejection is set up correctly ON THE CLIENT
        vi.mocked(mockDirectiveClient.handleDirective).mockRejectedValue(testError);
        
        await expect(service.interpret([directiveNode], { initialState: mockStateService }))
            .rejects.toThrow(MeldInterpreterError);
        
        try {
            await service.interpret([directiveNode], { initialState: mockStateService });
        } catch (error) {
             expect(error).toBeInstanceOf(MeldInterpreterError);
             const meldError = error as MeldInterpreterError;
             expect(meldError.sourceLocation?.line).toEqual(location?.start.line);
             expect(meldError.sourceLocation?.column).toEqual(location?.start.column);
             expect(meldError.message).toContain('Handler loc Test error');
             expect(meldError.cause).toBe(testError);
        }
    });

    // REMOVE SKIP
    it('sets file path in working state when provided in options', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const filePath = 'test-path.meld';
      // Use mock from beforeEach
      vi.spyOn(mockStateService, 'setCurrentFilePath');
      vi.spyOn(mockStateService, 'createChildState').mockReturnValue(mockStateService); // Ensure child state is created

      await service.interpret([textNode], { initialState: mockStateService, filePath: filePath });
      
      // FIX: Expect clone 4 times (init current, init snapshot, applyStateChanges, update lastGoodState)
      expect(mockStateService.clone).toHaveBeenCalledTimes(4); 
      // Check that setCurrentFilePath was called on the *cloned* working state
      expect(mockStateService.setCurrentFilePath).toHaveBeenCalledWith(filePath);
    });

    it('passes context to directive client', async () => {
      const location = createLocation(1, 1, 1, 12);
      const directiveNode: DirectiveNode = createDirectiveNode('text', {}, location);
      const options: InterpreterOptions = { initialState: mockStateService, mergeState: true, filePath: 'test.mld' };
      vi.spyOn(mockStateService, 'clone').mockReturnValue(mockStateService);
      vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(options.filePath ?? null);
      vi.spyOn(mockPathService, 'dirname').mockReturnValue('/test');
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: [] });
      await service.interpret([directiveNode], options);
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
            state: mockStateService,
            directiveNode: directiveNode,
            resolutionContext: expect.objectContaining({ currentFilePath: options.filePath }),
            formattingContext: expect.objectContaining({ nodeType: 'Directive' }),
            executionContext: undefined
        })
      );
    });

    // REMOVE SKIP
    it('handles command variables correctly (access on state)', async () => {
        const directiveNode: DirectiveNode = createDirectiveNode('run', { command: 'test-command' });
        const commandDef = { kind: 'basic', commandTemplate: 'echo test' } as any;
        const commandVar = { name: 'test-command', value: commandDef, type: VariableType.COMMAND } as CommandVariable;
        
        // Use mockStateService from beforeEach
        vi.spyOn(mockStateService, 'clone').mockReturnValue(mockStateService);
        vi.spyOn(mockStateService, 'getCommandVar').mockReturnValue(commandVar);

        // Mock the client's handleDirective to return a VALID empty result
        vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementation(async (node, ctx) => {
            ctx.state.getCommandVar('test-command'); // Access within the mock implementation
            return { stateChanges: undefined, replacement: [] }; // Use empty array for replacement
        });

        await service.interpret([directiveNode], { initialState: mockStateService });

        expect(mockStateService.clone).toHaveBeenCalled();
        expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
        // Check that getCommandVar was called on the state passed to the handler
        expect(mockStateService.getCommandVar).toHaveBeenCalledWith('test-command');
    });

    // REMOVE SKIP
    // --- REVISED TEST for Phase 3 TextNode Resolution ---
    it('processes TextNode with interpolation via parser and resolution services', async () => {
      const originalContent = 'Hello {{name}}!';
      const sourceFilePath = '/interpolate/path.mld';
      const textLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: 15 } };
      const textNode = createTextNode(originalContent, textLocation);
      const varLocation = { start: { line: 1, column: 7 }, end: { line: 1, column: 14 } };
      const mockParsedNodes: InterpolatableValue = [
        createTextNode('Hello ', { start: { line: 1, column: 1 }, end: { line: 1, column: 7 } }),
        createVariableReferenceNode('name', 'text', undefined, varLocation)
      ];
      const resolvedContent = 'Hello World!';

      vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(sourceFilePath);
      const parseStringSpy = vi.spyOn(mockParserClient, 'parseString');
      parseStringSpy.mockResolvedValue(mockParsedNodes);
      const resolveNodesSpy = vi.spyOn(mockResolutionService, 'resolveNodes');
      resolveNodesSpy.mockResolvedValue(resolvedContent);
      const addNodeSpy = vi.spyOn(mockStateService, 'addNode');

      await service.interpretNode(textNode, mockStateService);

      expect(parseStringSpy).toHaveBeenCalledTimes(1);
      expect(parseStringSpy).toHaveBeenCalledWith(
        originalContent,
        expect.objectContaining({ filePath: sourceFilePath }) // ONLY check filePath
      );
      expect(resolveNodesSpy).toHaveBeenCalledTimes(1);
      expect(resolveNodesSpy).toHaveBeenCalledWith(
        mockParsedNodes,
        expect.objectContaining({ currentFilePath: sourceFilePath })
      );
      expect(addNodeSpy).toHaveBeenCalledTimes(1);
      expect(addNodeSpy).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'Text',
        content: resolvedContent 
      }));
    });

    // This test structure seems problematic as interpretNode doesn't directly call DirectiveService
    // It uses the DirectiveServiceClient. Re-evaluate the goal.
    // REMOVING this skipped test as it seems invalid based on the comment and architecture.
    /*
    it.skip('routes DirectiveNode to DirectiveService.handleDirective', async () => {
        // <<< Use 'text' kind >>>
        const directiveNode = createDirectiveNode('text', { identifier: 'test' }); 
        // const mockResult: DirectiveResult = await mockTextHandler.handle({ directiveNode } as DirectiveProcessingContext);
        
        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/path/file.mld');
        // We should check the CLIENT mock, not the service mock
        // vi.mocked(mockDirectiveService.handleDirective).mockResolvedValue(mockResult);
        vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: undefined });

        await service.interpretNode(directiveNode, mockStateService);

        // Check the CLIENT mock
        expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
        expect(mockDirectiveClient.handleDirective).toHaveBeenCalledWith(
            directiveNode,
            expect.objectContaining({ state: mockStateService })
        );
    });
    */

    // This test focuses on interpretNode, which itself doesn't apply state changes.
    // State changes are applied within the main interpret loop *after* interpretNode returns.
    // Let's test the interaction with the client correctly.
    it('calls directive client and receives stateChanges result', async () => {
        const directiveNode = createDirectiveNode('text', { identifier: 'processedVar' }); 
        const mockStateChanges: StateChanges = {
            variables: {
                processedVar: { type: VariableType.TEXT, value: 'resultValue' } 
            }
        };
        const mockResult: DirectiveResult = { stateChanges: mockStateChanges, replacement: undefined };

        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/path/file.meld');
        vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(mockResult);
        // const setVariableSpy = vi.spyOn(mockStateService, 'setVariable'); // interpretNode doesn't call this

        // Call interpretNode and capture its internal processing result
        // Linter Fix: Cast result to any for testing internal return shape
        // Step 2: Expect tuple return, check second element
        const [resultingState, directiveResult] = await service.interpretNode(directiveNode, mockStateService);

        // Verify the client was called
        expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
        expect(mockDirectiveClient.handleDirective).toHaveBeenCalledWith(
            directiveNode,
            expect.objectContaining({ state: mockStateService })
        );
        // Verify the result returned by interpretNode contains the stateChanges from the client
        // Step 2: Check the directiveResult from the tuple
        expect(directiveResult?.stateChanges).toEqual(mockStateChanges);
        expect(directiveResult?.replacement).toBeUndefined();
        // Verify setVariable was NOT called directly by interpretNode
        // expect(setVariableSpy).not.toHaveBeenCalled();
    });

    // Test the replacement node handling within interpretNode
    it('calls directive client and receives replacement node result', async () => {
        const directiveNode = createDirectiveNode('embed', { subtype: 'embedPath', path: 'file.md' }); 
        const replacementNode = createTextNode('Transformed');
        const mockResult: DirectiveResult = { stateChanges: undefined, replacement: [replacementNode] };

        vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue('/path/file.meld');
        vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(mockResult); 
        // vi.spyOn(mockStateService, 'isTransformationEnabled').mockReturnValue(true); // interpretNode doesn't check this
        // const addNodeSpy = vi.spyOn(mockStateService, 'addNode'); // interpretNode doesn't call this

        // Linter Fix: Cast result to any for testing internal return shape
        // Step 2: Expect tuple return, check second element
        const [resultingState, directiveResult] = await service.interpretNode(directiveNode, mockStateService);

        expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
        // Step 2: Check the directiveResult from the tuple
        expect(directiveResult?.replacement).toEqual([replacementNode]);
        expect(directiveResult?.stateChanges).toBeUndefined();
        // expect(addNodeSpy).not.toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    // REMOVE SKIP
    it('creates child state from initial state when interpreting', async () => {
      const textNode: TextNode = createTextNode('Test content');
      // Use mock from beforeEach instead of manual mock
      const initialTestState = mockStateService; 
      const workingState = mockStateService; // Default createChildState returns mockStateService

      // Spies are on mockStateService in beforeEach, ensure they are sufficient
      vi.spyOn(initialTestState, 'createChildState'); // Ensure spy is active
      vi.spyOn(workingState, 'addNode'); // Spy on addNode for this test

      await service.interpret([textNode], { initialState: initialTestState });

      // FIX: Expect clone 4 times (init current, init snapshot, applyStateChanges, update lastGoodState)
      expect(initialTestState.clone).toHaveBeenCalledTimes(4); 
    });

    // REMOVE SKIP
    it('returns the final working state', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const result = await service.interpret([textNode], { initialState: mockStateService });
      // The final state returned should be the working state instance
      expect(result).toBe(mockStateService); 
    });

    // REMOVE SKIP
    it('handles empty node arrays (returns final working state)', async () => {
      // Use the global mockStateService as the input
      const inputState = mockStateService;
      
      // --- Isolate Spies for this test ---
      const cloneSpy = vi.spyOn(inputState, 'clone');
      const createChildSpy = vi.spyOn(inputState, 'createChildState');
      cloneSpy.mockReturnValue(inputState); // Return self for simplicity
      
      // Clear previous calls
      cloneSpy.mockClear();
      createChildSpy.mockClear();
      
      // >>> Add Debugging <<<
      process.stdout.write(`[DEBUG TEST - handles empty node arrays] Before interpret: createChildSpy calls = ${createChildSpy.mock.calls.length}\n`);
      process.stdout.write(`[DEBUG TEST - handles empty node arrays] Before interpret: cloneSpy calls = ${cloneSpy.mock.calls.length}\n`);
      // >>> End Debugging <<<

      const result = await service.interpret([], { initialState: inputState });
      
      // >>> Add Debugging <<<
      process.stdout.write(`[DEBUG TEST - handles empty node arrays] After interpret: createChildSpy calls = ${createChildSpy.mock.calls.length}\n`);
      process.stdout.write(`[DEBUG TEST - handles empty node arrays] After interpret: cloneSpy calls = ${cloneSpy.mock.calls.length}\n`);
      // >>> End Debugging <<<

      // Verify createChildState was NOT called on the inputState *during* this interpret call
      expect(createChildSpy).not.toHaveBeenCalled(); 
      // Verify clone WAS called on the inputState *during* this interpret call (twice: initial + snapshot)
      expect(cloneSpy).toHaveBeenCalledTimes(2); 
      // The result should be the state instance created by the *first* clone call.
      expect(result).toBe(inputState); // Since clone returns inputState mock
    });
    
    // REMOVE SKIP
    it('merges state back if mergeState is true (default)', async () => {
      const textNode: TextNode = createTextNode('Test content');
      vi.spyOn(mockStateService, 'mergeChildState');
      
      await service.interpret([textNode], { initialState: mockStateService /* mergeState defaults to true */ });
      
      // Check merge was called with the correct states
      expect(mockStateService.mergeChildState).toHaveBeenCalledWith(mockStateService);
    });

    // This test PASSED, keep as is.
    it('creates state from internal service if no initial state provided', async () => {
      const textNode: TextNode = createTextNode('Test content');
      // Use mockStateService from beforeEach, reconfigure if needed
      const internalState = mockStateService;
      // Fix 5: Explicitly mock getStateId for this test case
      vi.spyOn(internalState, 'getStateId').mockReturnValue('internal-generated');
      // Mock createChildState for the internally resolved service to return our configured mock
      vi.spyOn(mockStateService, 'createChildState').mockReturnValue(internalState);
      vi.spyOn(internalState, 'clone').mockReturnValue(internalState);
      vi.spyOn(internalState, 'addNode');

      const result = await service.interpret([textNode], { /* no initialState */ });
      
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(internalState.addNode).toHaveBeenCalledWith(textNode);
      // Check the ID of the returned state
      expect(result.getStateId()).toBe('internal-generated');
    });
  });

  describe('error handling', () => {
    // REMOVE SKIP
    it('does NOT wrap generic errors during state creation (when initialState provided)', async () => {
      const node: TextNode = createTextNode('Test content');
      const creationError = new Error('Generic state creation error');
      // FIX: Mock clone() to reject because initialState is provided
      vi.spyOn(mockStateService, 'clone').mockImplementation(() => { throw creationError; });
      
      await expect(service.interpret([node], { initialState: mockStateService }))
            .rejects.toThrow(creationError); // Expect the raw error
    });
    
     // REMOVE SKIP
     it('preserves interpreter errors during state creation (when initialState provided)', async () => {
      const node: TextNode = createTextNode('Test content');
      const interpreterError = new MeldInterpreterError('State creation failed', 'STATE_ERROR');
       // FIX: Mock clone() to reject because initialState is provided
       vi.spyOn(mockStateService, 'clone').mockImplementation(() => { throw interpreterError; });
       
      await expect(service.interpret([node], { initialState: mockStateService }))
            .rejects.toThrow(interpreterError); // Expect the original MeldInterpreterError
    });
    
     // REMOVE SKIP
     it('wraps errors during node processing (handler client fails)', async () => {
      const node: DirectiveNode = createDirectiveNode('text', {});
      // Use mockStateService from beforeEach for initialState
      const processingError = new Error('Directive processing failed');
       vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValue(processingError);
       
      await expect(service.interpret([node], { initialState: mockStateService }))
             .rejects.toThrow(MeldInterpreterError);
       await expect(service.interpret([node], { initialState: mockStateService }))
             .rejects.toHaveProperty('cause', processingError);
    });

    // REMOVE SKIP
    it('extracts location from node for processing errors (handler client fails)', async () => {
        const location = createLocation(5, 10, 5, 20);
        const node: DirectiveNode = createDirectiveNode('text', {}, location);
        // Use mockStateService from beforeEach for initialState
        const processingError = new Error('Directive processing failed loc');
        vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValue(processingError);
        
        await expect(service.interpret([node], { initialState: mockStateService }))
             .rejects.toThrow(MeldInterpreterError);

        try {
            await service.interpret([node], { initialState: mockStateService });
        } catch (error) {
             expect(error).toBeInstanceOf(MeldInterpreterError);
             const meldError = error as MeldInterpreterError;
             expect(meldError.sourceLocation?.line).toEqual(location?.start.line);
             expect(meldError.sourceLocation?.column).toEqual(location?.start.column);
             expect(meldError.message).toContain('Directive processing failed loc');
             expect(meldError.cause).toBe(processingError);
        }
    });
    
    // REMOVE SKIP
    it('does NOT wrap errors from state.clone() (adjust expectation)', async () => {
      const node: TextNode = createTextNode('clone fail test');
      // Use mockStateService from beforeEach for initialState
      const cloneError = new Error('Clone failed');
      vi.spyOn(mockStateService, 'clone').mockImplementation(() => { throw cloneError; });

      await expect(service.interpret([node], { initialState: mockStateService }))
            .rejects.toThrow(cloneError);
    });
  });

  describe('edge cases', () => {
    // REMOVE SKIP
    it('clones working state even on partial failure (handler client fails)', async () => {
      const nodes: MeldNode[] = [
        createTextNode('test1'),
        createDirectiveNode('text', {}, createLocation(2,1))
      ];
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValue(new Error('Partial fail error'));
      
      await expect(service.interpret(nodes, { initialState: mockStateService })).rejects.toThrow(MeldInterpreterError);
      
      // FIX: Expect clone to be called (initial state, initial snapshot, AND after first node succeeds before error)
      expect(mockStateService.clone).toHaveBeenCalled(); // At least once is sufficient here
    });

    // REMOVE SKIP
    it('throws error for null node', async () => {
      await expect(service.interpret([null as unknown as MeldNode], { initialState: mockStateService }))
            .rejects.toThrow(MeldInterpreterError); // Check for the specific error type
      await expect(service.interpret([null as unknown as MeldNode], { initialState: mockStateService }))
            .rejects.toThrow(/No node provided for interpretation/); // Check message
    });

    // REMOVE SKIP
    it('throws error for undefined node', async () => {
      await expect(service.interpret([undefined as unknown as MeldNode], { initialState: mockStateService }))
            .rejects.toThrow(MeldInterpreterError); // Check for the specific error type
      await expect(service.interpret([undefined as unknown as MeldNode], { initialState: mockStateService }))
            .rejects.toThrow(/No node provided for interpretation/); // Check message
    });

    // REMOVE SKIP
    it('processes node without location', async () => {
      const node: TextNode = createTextNode('test');
      await service.interpret([node], { initialState: mockStateService });
      expect(mockStateService.addNode).toHaveBeenCalledWith(node);
    });

    // REMOVE SKIP
    it('processes node with partial location', async () => {
      const node: TextNode = createTextNode('test', createLocation(1, 1, 1, 5));
      await service.interpret([node], { initialState: mockStateService });
      expect(mockStateService.addNode).toHaveBeenCalledWith(node);
    });

    // REMOVE SKIP
    it('throws wrapped error on command variable processing error (in handler)', async () => {
      const node: DirectiveNode = createDirectiveNode('text', {}, createLocation(1,1));
      const initialTestState = mockStateService;
      const cmdError = new Error('Command lookup failed');
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValue(cmdError);

      await expect(service.interpret([node], { initialState: mockStateService }))
        .rejects.toThrow(MeldInterpreterError);
      await expect(service.interpret([node], { initialState: mockStateService }))
        .rejects.toHaveProperty('cause', cmdError);
    });

    // REMOVE SKIP - This tests interpretNode, adjust test to use interpret
    it('throws if directive node is missing directive property during interpret', async () => {
       const node = { type: 'Directive', location: createLocation(1,1) } as DirectiveNode; // Invalid node
       await expect(service.interpret([node], { initialState: mockStateService }))
             .rejects.toThrow(MeldInterpreterError); // Should throw during processing
       await expect(service.interpret([node], { initialState: mockStateService }))
             .rejects.toThrow(/Invalid directive node/); // Check message
    });
  });

  // Mark describe block as failing REMOVED - Attempting fix
  describe('Phase 5 Refactoring Verification (Manual Setup)', () => {
    // REMOVE SKIP
    it('passes correctly structured context to directive client', async () => {
      const location = createLocation(1,1);
      const directiveNode = createDirectiveNode('run', { subtype: 'runCommand', command: 'echo hello' }, location);
      const initialTestState = mockStateService;
      const workingState = mockStateService;
      const clonedState = mockStateService;
      vi.spyOn(mockPathService, 'dirname').mockReturnValue('/test');
      vi.spyOn(clonedState, 'getCurrentFilePath').mockReturnValue('/test/working-p5-manual.mld');
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ stateChanges: undefined, replacement: [] });
      await service.interpret([directiveNode], { initialState: initialTestState });
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      const handlerCall = (mockDirectiveClient.handleDirective as Mock).mock.calls[0];
      const passedNode = handlerCall[0];
      const passedContext = handlerCall[1];
      expect(passedNode).toBe(directiveNode);
      expect(passedContext).toBeDefined();
      expect(passedContext.state).toBe(clonedState);
      expect(passedContext.directiveNode).toBe(directiveNode);
      expect(passedContext.resolutionContext).toBeDefined();
      expect(passedContext.resolutionContext.currentFilePath).toBe('/test/working-p5-manual.mld');
      expect(passedContext.formattingContext).toBeDefined();
      expect(passedContext.formattingContext.nodeType).toBe('Directive');
      expect(passedContext.executionContext).toBeDefined();
      expect(passedContext.executionContext?.cwd).toBe('/test');
    });

    // REMOVE SKIP
    it('handles DirectiveResult with replacement node in transformation mode', async () => {
      const directiveNode = createDirectiveNode('embed', { subtype: 'embedPath', path: 'file.md' });
      // Use mock from beforeEach
      const initialTestState = mockStateService; 
      const workingState = mockStateService; // Default createChildState returns mockStateService
      // Configure mockStateService for transformation mode for this test
      vi.spyOn(workingState, 'isTransformationEnabled').mockReturnValue(true); 
      vi.spyOn(workingState, 'transformNode'); 
      // Ensure getTransformedNodes returns the node so findIndex works
      vi.mocked(workingState.getTransformedNodes).mockReturnValue([directiveNode]);

      const mockReplacementNode = createTextNode('Replaced Content', directiveNode.location);
      const directiveResult: DirectiveResult = {
        stateChanges: undefined,
        replacement: [mockReplacementNode]
      };
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(directiveResult);

      const finalState = await service.interpret([directiveNode], { initialState: initialTestState });

      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      // Expect the second argument to be the array containing the replacement node
      expect(workingState.transformNode).toHaveBeenCalledWith(0, [mockReplacementNode]); 
      expect(finalState).toBe(workingState); 
    });

    // REMOVE SKIP
    // This test verifies handling of an *invalid* return type from the client.
    // It should now throw a type error earlier or a structured error.
    it('throws error if directive client returns invalid result type', async () => {
      const directiveNode = createDirectiveNode('text', { identifier: 'abc', value: 'def' });
      // Use mock from beforeEach
      const initialTestState = mockStateService; 
      
      // Configure mock to return invalid shape
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue({ invalidProperty: true } as any); 

      await expect(service.interpret([directiveNode], { initialState: initialTestState }))
        .rejects.toThrow(MeldInterpreterError); // Expect the wrapper error
      await expect(service.interpret([directiveNode], { initialState: initialTestState }))
        .rejects.toThrow(/Invalid result type returned from directive handler client/); // Check specific error message
    });
  });
}); 