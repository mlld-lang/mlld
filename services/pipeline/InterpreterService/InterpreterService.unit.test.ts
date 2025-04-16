import { describe, it, expect, beforeEach, vi, afterEach, Mock } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types/index.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createTextNode, createDirectiveNode, createLocation } from '@tests/utils/testFactories.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { VariableType, type CommandVariable, type TextVariable } from '@core/types/index.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { InterpreterTestFixture } from '@tests/utils/fixtures/InterpreterTestFixture.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { container, DependencyContainer } from 'tsyringe';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import type { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { mock } from 'vitest-mock-extended';
import type { OutputFormattingContext, JsonValue } from '@core/types/index.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import type { IFileSystem } from '@services/fs/FileSystemService/IFileSystem.js';
import { DirectiveResult } from '@services/pipeline/DirectiveService/interfaces/DirectiveTypes.js';

// Define a minimal logger interface for testing
interface ITestLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  level?: string; 
}

describe('InterpreterService Unit', () => {
  let testContainer: DependencyContainer;
  let service: IInterpreterService;
  let mockResolutionService: IResolutionService;
  let mockPathService: IPathService;
  let mockDirectiveClient: IDirectiveServiceClient;
  let mockDirectiveClientFactory: DirectiveServiceClientFactory;
  let mockStateService: IStateService;
  let mockParserClient: IParserServiceClient;
  let mockParserClientFactory: ParserServiceClientFactory;

  beforeEach(async () => {
    vi.resetAllMocks();

    // Create mock logger first
    const mockLogger: ITestLogger = { 
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        level: 'info' 
    };

    // --- Create Mocks ---
    // Basic services (can use MockFactory or create manually)
    mockResolutionService = { resolveNodes: vi.fn(), resolveInContext: vi.fn() } as unknown as IResolutionService;
    mockPathService = { dirname: vi.fn().mockReturnValue('.') } as unknown as IPathService;
    // REVERT to object literal approach
    // mockStateService = mock<IStateService>();
    mockStateService = {
      // Define clone directly
      clone: vi.fn().mockImplementation(() => {
        process.stdout.write(`[LOG][clone Mock Direct Definition] ENTERED.\n`);
        // process.stdout.write(`[LOG][clone Mock Direct Definition] Returning mockStateService instance.\n`);
        return mockStateService;
      }),
      // Define createChildState directly
      createChildState: vi.fn().mockImplementation(() => {
        process.stdout.write(`[LOG][createChildState Mock Direct Definition] ENTERED\n`);
        // process.stdout.write(`[LOG][createChildState Mock Direct Definition] Returning mockStateService. Type of clone: ${typeof (mockStateService as any).clone}\n`);
        return mockStateService;
      }),
      addNode: vi.fn(),
      setTextVar: vi.fn(),
      setDataVar: vi.fn(),
      setPathVar: vi.fn(),
      setCommand: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getPathVar: vi.fn(),
      getCommand: vi.fn(),
      getCommandVar: vi.fn(), // Keep added mock
      getCurrentFilePath: vi.fn(),
      isTransformationEnabled: vi.fn(),
      getStateId: vi.fn(),
      mergeChildState: vi.fn(),
      setCurrentFilePath: vi.fn(),
      getNodes: vi.fn().mockReturnValue([]),
      transformNode: vi.fn(), 
      getTransformedNodes: vi.fn().mockReturnValue([]), 
      _mockStorage: {},
    } as unknown as IStateService;

    // Mock Clients
    mockDirectiveClient = { handleDirective: vi.fn(), supportsDirective: vi.fn().mockReturnValue(true) } as unknown as IDirectiveServiceClient;
    mockParserClient = { parseString: vi.fn() } as unknown as IParserServiceClient;

    // Mock Factories to return Mock Clients
    mockDirectiveClientFactory = { createClient: vi.fn().mockReturnValue(mockDirectiveClient) } as unknown as DirectiveServiceClientFactory;
    mockParserClientFactory = { createClient: vi.fn().mockReturnValue(mockParserClient) } as unknown as ParserServiceClientFactory;

    // --- Create Container & Register Mocks ---
    testContainer = container.createChildContainer();
    testContainer.registerInstance('IResolutionService', mockResolutionService);
    testContainer.registerInstance('IPathService', mockPathService);
    testContainer.registerInstance('IStateService', mockStateService);
    // Register FACTORIES using CLASS tokens (assuming InterpreterService injects them by class)
    testContainer.registerInstance(DirectiveServiceClientFactory, mockDirectiveClientFactory); 
    testContainer.registerInstance(ParserServiceClientFactory, mockParserClientFactory); // Assume Parser factory uses Class token for now

    // Register needed transitive dependencies (like IFileSystem for FileSystemService)
    const mockFileSystem = {} as unknown as IFileSystem; // Minimal mock
    testContainer.registerInstance('IFileSystem', mockFileSystem); 

    // Register the mock logger
    testContainer.registerInstance('DirectiveLogger', mockLogger); 

    // --- Configure default mock behaviors --- 
    // Restore spyOn for clone and createChildState?
    // No, they are defined directly above now.
    // Remove default implementations set via vi.mocked()
    /*
    vi.mocked(mockStateService.clone).mockImplementation(...);
    vi.mocked(mockStateService.createChildState).mockImplementation(...);
    vi.mocked(mockStateService.getNodes).mockReturnValue([]);
    vi.mocked(mockStateService.getTransformedNodes).mockReturnValue([]);
    vi.mocked(mockStateService.addNode).mockImplementation(() => {});
    vi.mocked(mockStateService.getStateId).mockReturnValue('mock-state-id');
    vi.mocked(mockStateService.getCurrentFilePath).mockReturnValue(null);
    vi.mocked(mockStateService.isTransformationEnabled).mockReturnValue(false);
    vi.mocked(mockStateService.transformNode).mockImplementation(() => {});
    vi.mocked(mockStateService.mergeChildState).mockImplementation(() => {});
    vi.mocked(mockStateService.setCurrentFilePath).mockImplementation(() => {});
    vi.mocked(mockStateService.setTextVar).mockImplementation(...);
    vi.mocked(mockStateService.getTextVar).mockImplementation(...);
    vi.mocked(mockStateService.getCommandVar).mockReturnValue(undefined); 
    */
    
    // Explicitly set clone/createChildState implementations *after* mock creation are removed
    // mockStateService.clone = vi.fn().mockImplementation(...);
    // mockStateService.createChildState = vi.fn().mockImplementation(...);

    // Keep default handleDirective mock
    vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementation(async (node, ctx) => { // Default handler returns state
      process.stdout.write(`[LOG][handleDirective Mock - Default beforeEach] Called for node kind: ${node?.directive?.kind}. Returning state.\n`);
      return ctx.state;
    });

    // Keep direct assignments for set/getTextVar ? Let's define them on the object literal for simplicity.
    // mockStateService.setTextVar = vi.fn()...;
    // mockStateService.getTextVar = vi.fn()...;

    // Resolve the service under test using its CONCRETE CLASS
    service = testContainer.resolve(InterpreterService); 
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
    it('processes text nodes by adding to working state', async () => {
      const textNode: TextNode = createTextNode('Test content');
      
      // Use the mockStateService from beforeEach as the initial state
      // Spies are already configured on it in beforeEach
      const initialTestState = mockStateService;
      const workingState = mockStateService; // createChildState mock returns itself

      // Ensure spies are active (redundant if beforeEach is correct, but safe)
      vi.spyOn(initialTestState, 'createChildState'); 
      vi.spyOn(workingState, 'addNode'); 
      vi.spyOn(workingState, 'clone'); 

      const finalState = await service.interpret([textNode], { initialState: initialTestState });

      expect(initialTestState.createChildState).toHaveBeenCalledTimes(1);
      expect(workingState.addNode).toHaveBeenCalledWith(textNode);
      expect(finalState).toBe(workingState); // Should return the working state
    });

    it('processes directive nodes by calling directiveService.handleDirective client', async () => {
      const directiveNode: DirectiveNode = createDirectiveNode('text', { identifier: 'test', value: 'value' });
      
      // Create specific mock state instances for this test to isolate behavior
      const initialTestState = { 
        createChildState: vi.fn(), 
        // Add other methods if needed by the specific code path under test
        getStateId: vi.fn().mockReturnValue('initial-test-state'),
        setCurrentFilePath: vi.fn(),
        getCurrentFilePath: vi.fn().mockReturnValue('test-file.mld'),
        clone: vi.fn(), // Add clone even if not directly called on initial
      } as unknown as IStateService;
      
      const workingState = {
        clone: vi.fn(),
        addNode: vi.fn(),
        getNodes: vi.fn().mockReturnValue([]),
        getStateId: vi.fn().mockReturnValue('working-test-state'),
        isTransformationEnabled: vi.fn().mockReturnValue(false),
        getCurrentFilePath: vi.fn().mockReturnValue('test-file.mld'),
        // Add other methods used by DirectiveContextFactory or interpretNode
      } as unknown as IStateService;
      
      const clonedState = {
        getStateId: vi.fn().mockReturnValue('cloned-test-state'),
        // Add methods potentially used after handleDirective returns
        // (or methods needed by the expect.objectContaining check)
        getCurrentFilePath: vi.fn().mockReturnValue('test-file.mld'),
        addNode: vi.fn(),
        clone: vi.fn().mockReturnThis(),
        isTransformationEnabled: vi.fn().mockReturnValue(false),
        setTextVar: vi.fn(),
        getNodes: vi.fn().mockReturnValue([]),
      } as unknown as IStateService;

      // Set up the chain: initial -> working -> cloned
      vi.spyOn(initialTestState, 'createChildState').mockReturnValue(workingState); // Assume synchronous for simplicity unless async needed
      vi.spyOn(workingState, 'clone').mockReturnValue(clonedState);

      // Configure the handleDirective mock for this specific test case
      // Ensure the client mock from beforeEach is spied on
      // Return workingState instead of clonedState to see if it resolves the type issue
      // Update: Return as DirectiveResult structure
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(clonedState as IStateService);

      // Reset call counts from beforeEach if necessary (optional, depends on isolation needs)
      // vi.mocked(mockDirectiveClient.handleDirective).mockClear();

      await service.interpret([directiveNode], { initialState: initialTestState });
      
      expect(initialTestState.createChildState).toHaveBeenCalled(); 
      expect(workingState.clone).toHaveBeenCalled(); 
      
      // Assert call on the *client* mock (mockDirectiveClient from beforeEach)
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: clonedState as IStateService, // Expecting the explicitly created clonedState
          directiveNode: directiveNode // Ensure the node passed in context matches
          // We\'re not need to strictly check resolutionContext, etc. for this test
        })
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
        // Ensure the spy/rejection is set up correctly
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

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('sets file path in working state when provided in options', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const filePath = 'test-path.meld';
      // Use mock from beforeEach
      vi.spyOn(mockStateService, 'setCurrentFilePath');

      await service.interpret([textNode], { initialState: mockStateService, filePath: filePath });
      
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(mockStateService.setCurrentFilePath).toHaveBeenCalledWith(filePath);
    });

    it('passes context to directive client', async () => {
      const location = createLocation(1, 1, 1, 12);
      const directiveNode: DirectiveNode = createDirectiveNode('text', {}, location);
      const options: InterpreterOptions = { initialState: mockStateService, mergeState: true, filePath: 'test.mld' };
      
      // Ensure clone returns the main mockStateService for context creation
      // Remove the separate directiveWorkingState mock
      vi.spyOn(mockStateService, 'clone').mockReturnValue(mockStateService);
      // We need getCurrentFilePath on the cloned state (mockStateService) for context creation
      // Handle potential undefined filePath for type safety
      vi.spyOn(mockStateService, 'getCurrentFilePath').mockReturnValue(options.filePath ?? null); 

      await service.interpret([directiveNode], options);
      
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ 
            state: mockStateService, // State passed to handler should be the result of clone
            directiveNode: directiveNode,
            resolutionContext: expect.objectContaining({ currentFilePath: options.filePath }),
            formattingContext: expect.objectContaining({ nodeType: 'Directive' })
            // executionContext is likely undefined for non-run directives, omit strict check
        })
      );
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('handles command variables correctly (access on state)', async () => {
        const directiveNode: DirectiveNode = createDirectiveNode('run', { command: 'test-command' });
        const commandDef = { kind: 'basic', commandTemplate: 'echo test' } as any;
        const commandVar = { name: 'test-command', value: commandDef, type: VariableType.COMMAND } as CommandVariable;
        
        // Use mockStateService directly
        vi.spyOn(mockStateService, 'getCommandVar').mockReturnValue(commandVar);

        vi.spyOn(mockDirectiveClient, 'handleDirective').mockImplementation(async (node, ctx) => {
            ctx.state.getCommandVar('test-command'); 
            return ctx.state; 
        });

        await service.interpret([directiveNode], { initialState: mockStateService });

        expect(mockStateService.clone).toHaveBeenCalled();
        expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
        expect(mockStateService.getCommandVar).toHaveBeenCalledWith('test-command');
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('processes text nodes with interpolation via parser and resolution services', async () => {
        const node = createTextNode('Hello {{name}}!', createLocation(1, 1));
        // Use mockStateService from beforeEach
        const initialTestState = mockStateService; 
        const workingState = mockStateService; // createChildState returns mockStateService
        
        const parsedInterpolatable: InterpolatableValue = [
            createTextNode('Hello ', createLocation(1, 1)),
            { type: 'VariableReference', identifier: 'name', valueType: 'text', isVariableReference: true, location: createLocation(1, 8) },
            createTextNode('!', createLocation(1, 14))
        ];
        const resolvedContent = 'Hello Alice!';

        // Reset mocks/spies specifically for this test if needed, or rely on beforeEach
        // Ensure methods used in the code path exist on mockStateService
        // vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState); // Already done in beforeEach if initialTestState IS mockStateService
        // vi.spyOn(workingState, 'clone').mockReturnValue(workingState); // Already done in beforeEach
        vi.spyOn(workingState, 'addNode'); // Ensure we can track this call
        vi.spyOn(workingState, 'getCurrentFilePath').mockReturnValue('/interpolate/path.mld'); // Set specific return value for this test
        vi.spyOn(mockParserClient, 'parseString').mockResolvedValue(parsedInterpolatable);
        vi.spyOn(mockResolutionService, 'resolveNodes').mockResolvedValue(resolvedContent);

        await service.interpret([node], { initialState: initialTestState });

        expect(mockParserClient.parseString).toHaveBeenCalledWith(
            'Hello {{name}}!',
            expect.objectContaining({ filePath: '/interpolate/path.mld' })
        );
        expect(mockResolutionService.resolveNodes).toHaveBeenCalledWith(
            // Ensure the structure passed to resolveNodes matches exactly
            expect.arrayContaining(parsedInterpolatable), // Might need more specific matcher
            expect.objectContaining({ 
              currentFilePath: '/interpolate/path.mld', // Check context passed to resolution
              state: workingState // Verify state is passed
            })
        );
        expect(workingState.addNode).toHaveBeenCalledWith(expect.objectContaining({
            type: 'Text',
            content: resolvedContent
        }));
    });
  });

  describe('state management', () => {
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('creates child state from initial state when interpreting', async () => {
      const textNode: TextNode = createTextNode('Test content');
      // Use mock from beforeEach instead of manual mock
      const initialTestState = mockStateService; 
      const workingState = mockStateService; // Default createChildState returns mockStateService

      // Spies are on mockStateService in beforeEach, ensure they are sufficient
      // vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
      // vi.spyOn(workingState, 'clone').mockReturnValue(workingState);
      vi.spyOn(workingState, 'addNode'); // Spy on addNode for this test

      await service.interpret([textNode], { initialState: initialTestState });

      expect(initialTestState.createChildState).toHaveBeenCalled();
      await service.interpret([textNode], { initialState: mockStateService });
      expect(mockStateService.createChildState).toHaveBeenCalled();
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('returns the final working state', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const result = await service.interpret([textNode], { initialState: mockStateService });
      expect(result.getStateId()).toBe(mockStateService.getStateId()); 
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('handles empty node arrays (returns final working state)', async () => {
      const result = await service.interpret([], { initialState: mockStateService });
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(mockStateService.clone).toHaveBeenCalled(); 
      expect(result.getStateId()).toBe(mockStateService.getStateId());
    });
    
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('merges state back if mergeState is true (default)', async () => {
      const textNode: TextNode = createTextNode('Test content');
      vi.spyOn(mockStateService, 'mergeChildState');
      
      await service.interpret([textNode], { initialState: mockStateService /* mergeState defaults to true */ });
      
      expect(mockStateService.mergeChildState).toHaveBeenCalledWith(mockStateService);
    });

    // This test PASSED, keep as is.
    it('does NOT merge state back if mergeState is false', async () => {
      const textNode: TextNode = createTextNode('Test content');
      vi.spyOn(mockStateService, 'mergeChildState');

      await service.interpret([textNode], { initialState: mockStateService, mergeState: false });
      
      expect(mockStateService.mergeChildState).not.toHaveBeenCalled();
    });
    
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('creates state from internal service if no initial state provided', async () => {
      const textNode: TextNode = createTextNode('Test content');
      // Use mockStateService from beforeEach, reconfigure if needed
      const internalState = mockStateService;
      vi.spyOn(internalState, 'getStateId').mockReturnValue('internal-generated');
      vi.spyOn(mockStateService, 'createChildState').mockResolvedValue(internalState);
      vi.spyOn(internalState, 'clone').mockReturnValue(internalState);
      vi.spyOn(internalState, 'addNode');

      const result = await service.interpret([textNode], { /* no initialState */ });
      
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(internalState.addNode).toHaveBeenCalledWith(textNode);
      expect(result.getStateId()).toBe('internal-generated');
    });
  });

  describe('error handling', () => {
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('does NOT wrap generic errors during state creation (when initialState provided)', async () => {
      const node: TextNode = createTextNode('Test content');
      // Use mockStateService from beforeEach for initialState
      const creationError = new Error('Generic state creation error');
      // Mock rejection for this specific test case
      vi.spyOn(mockStateService, 'createChildState').mockRejectedValue(creationError);
      
      await expect(service.interpret([node], { initialState: mockStateService }))
            .rejects.toThrow(creationError);
    });
    
     // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
     it('preserves interpreter errors during state creation (when initialState provided)', async () => {
      const node: TextNode = createTextNode('Test content');
      // Use mockStateService from beforeEach for initialState
      const interpreterError = new MeldInterpreterError('State creation failed', 'STATE_ERROR');
       // Mock rejection for this specific test case
       vi.spyOn(mockStateService, 'createChildState').mockRejectedValue(interpreterError);
       
      await expect(service.interpret([node], { initialState: mockStateService }))
            .rejects.toThrow(interpreterError);
    });
    
     // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
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

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
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
    
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
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
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('clones working state even on partial failure (handler client fails)', async () => {
      const nodes: MeldNode[] = [
        createTextNode('test1'),
        createDirectiveNode('text', {}, createLocation(2,1))
      ];
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockRejectedValue(new Error('Partial fail error'));
      
      await expect(service.interpret(nodes, { initialState: mockStateService })).rejects.toThrow(MeldInterpreterError);
      
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(mockStateService.clone).toHaveBeenCalled();
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('throws error for null node', async () => {
      await expect(service.interpret([null as unknown as MeldNode], { initialState: mockStateService }))
            .rejects.toThrow(/No node provided for interpretation/);
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('throws error for undefined node', async () => {
      await expect(service.interpret([undefined as unknown as MeldNode], { initialState: mockStateService }))
            .rejects.toThrow(/No node provided for interpretation/);
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('processes node without location', async () => {
      const node: TextNode = createTextNode('test');
      await service.interpret([node], { initialState: mockStateService });
      expect(mockStateService.addNode).toHaveBeenCalledWith(node);
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('processes node with partial location', async () => {
      const node: TextNode = createTextNode('test', createLocation(1, 1, 1, 5));
      await service.interpret([node], { initialState: mockStateService });
      expect(mockStateService.addNode).toHaveBeenCalledWith(node);
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
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

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('throws if directive node is missing directive property', async () => {
       const node = createDirectiveNode('text', {}, createLocation(1,1));
       (node as any).directive = undefined;
       await expect(service.interpret([node], { initialState: mockStateService }))
             .rejects.toThrow(/Invalid directive node/);
    });
  });

  // Mark describe block as failing
  describe('Phase 5 Refactoring Verification (Manual Setup)', () => {
    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('passes correctly structured context to directive client', async () => {
      const location = createLocation(1,1);
      const directiveNode = createDirectiveNode('run', { subtype: 'runCommand', command: 'echo hello' }, location);
      // Use mock from beforeEach
      const initialTestState = mockStateService; 
      const workingState = mockStateService; // Default createChildState returns mockStateService
      const clonedState = mockStateService;  // Default clone returns mockStateService
      // const clonedState = mock<IStateService>({
      //     getStateId: vi.fn().mockReturnValue('clonedForContextP5Manual'),
      //     getCurrentFilePath: vi.fn().mockReturnValue('/test/working-p5-manual.mld') 
      // });
      
      // Ensure spies from beforeEach are sufficient or re-spy if needed
      // vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
      // vi.spyOn(workingState, 'clone').mockReturnValue(clonedState);
      vi.spyOn(mockPathService, 'dirname').mockReturnValue('/test'); 
      // Set specific file path for this test's state
      vi.spyOn(clonedState, 'getCurrentFilePath').mockReturnValue('/test/working-p5-manual.mld');
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(clonedState);
      
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

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('handles DirectiveResult with replacement node in transformation mode', async () => {
      const directiveNode = createDirectiveNode('embed', { subtype: 'embedPath', path: 'file.md' });
      // Use mock from beforeEach
      const initialTestState = mockStateService; 
      const workingState = mockStateService; // Default createChildState returns mockStateService
      // Configure mockStateService for transformation mode for this test
      vi.spyOn(workingState, 'isTransformationEnabled').mockReturnValue(true); 
      // vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
      // vi.spyOn(workingState, 'clone').mockReturnValue(workingState);
      vi.spyOn(workingState, 'transformNode'); 
      // Ensure getTransformedNodes returns the node so findIndex works
      vi.mocked(workingState.getTransformedNodes).mockReturnValue([directiveNode]);

      const mockReplacementNode = createTextNode('Replaced Content', directiveNode.location);
      const directiveResult = {
        state: workingState, 
        replacement: mockReplacementNode
      };
      
      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(directiveResult); 

      const finalState = await service.interpret([directiveNode], { initialState: initialTestState });

      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      expect(workingState.transformNode).toHaveBeenCalledWith(0, mockReplacementNode); 
      expect(finalState).toBe(workingState); 
    });

    // TODO(mock-issue): Skipping due to complex DI/mock interaction issues (see Issue #39).
    it('handles direct IStateService return from directive client', async () => {
      const directiveNode = createDirectiveNode('text', { identifier: 'abc', value: 'def' });
      // Use mock from beforeEach
      const initialTestState = mockStateService; 
      const workingState = mockStateService; // Default createChildState returns mockStateService
      // vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
      // vi.spyOn(workingState, 'clone').mockReturnValue(workingState);
      vi.spyOn(workingState, 'transformNode'); 

      vi.spyOn(mockDirectiveClient, 'handleDirective').mockResolvedValue(workingState); 

      const finalState = await service.interpret([directiveNode], { initialState: initialTestState });

      expect(mockDirectiveClient.handleDirective).toHaveBeenCalledTimes(1);
      expect(workingState.transformNode).not.toHaveBeenCalled();
      expect(finalState).toBe(workingState); 
    });

  });
}); 