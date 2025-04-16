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
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { VariableType, type CommandVariable } from '@core/types/index.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { InterpreterTestFixture } from '@tests/utils/fixtures/InterpreterTestFixture.js';
import { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';

describe('InterpreterService Unit', () => {
  let fixture: InterpreterTestFixture;
  let service: IInterpreterService;
  let stateService: IStateService;
  let directiveService: IDirectiveService;
  let resolutionService: IResolutionService;
  let parserService: IParserService;
  let pathService: IPathService;
  let mockInitialState: IStateService;
  let workingMockState: IStateService;

  beforeEach(async () => {
    fixture = await InterpreterTestFixture.create();
    service = fixture.interpreterService;
    stateService = fixture.stateService;
    directiveService = fixture.directiveService;
    resolutionService = fixture.resolutionService;
    parserService = fixture.parserService;
    pathService = fixture.pathService;

    mockInitialState = MockFactory.createStateService({
      getStateId: vi.fn().mockReturnValue('mockInitialState'),
      getCurrentFilePath: vi.fn().mockReturnValue('/test/initial.mld')
    });
    workingMockState = MockFactory.createStateService({
      getStateId: vi.fn().mockReturnValue('workingMockState'),
      getCurrentFilePath: vi.fn().mockReturnValue('/test/working.mld')
    });

    vi.spyOn(mockInitialState, 'createChildState').mockResolvedValue(workingMockState);
    vi.spyOn(workingMockState, 'clone').mockReturnValue(workingMockState);
    vi.spyOn(workingMockState, 'addNode').mockReturnValue(undefined);

    vi.spyOn(pathService, 'dirname').mockImplementation((filePath: string) => {
      if (filePath.includes('/')) {
        return filePath.substring(0, filePath.lastIndexOf('/'));
      }
      return '.';
    });
    
    vi.spyOn(directiveService, 'handleDirective').mockImplementation(async (node, ctx) => {
      return ctx.state;
    });
    
    vi.spyOn(stateService, 'clone').mockImplementation(() => stateService);
    vi.spyOn(stateService, 'createChildState').mockResolvedValue(workingMockState);
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/default/test.mld');
    vi.spyOn(stateService, 'isTransformationEnabled').mockReturnValue(true);
    vi.spyOn(stateService, 'mergeChildState');
    vi.spyOn(stateService, 'clone').mockImplementation(() => stateService);
    vi.spyOn(parserService, 'parseString');

    // Resolve the service under test using its CONCRETE CLASS
    service = await fixture.context.resolve(InterpreterService);
    // --- Add Log After Resolve ---
    console.log(`[TEST beforeEach] Resolved service. Typeof interpret: ${typeof service?.interpret}, Constructor: ${service?.constructor?.name}`);

    // --- Minimal Spies Setup ---
    // Spy only on methods potentially used by TextNode processing
  });

  afterEach(async () => {
    await fixture?.cleanup();
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
      
      // --- Create Minimal Manual Mocks for this Test --- 
      const workingState: IStateService = {
        // Methods needed by the test assertions/logic
        getStateId: vi.fn().mockReturnValue('workingState'),
        addNode: vi.fn(),
        clone: vi.fn(),
        // Add other methods potentially called by the service on currentState
        getCurrentFilePath: vi.fn().mockReturnValue('/test/manual-working.mld'),
        setCurrentFilePath: vi.fn(),
        isTransformationEnabled: vi.fn().mockReturnValue(false),
        getNodes: vi.fn().mockReturnValue([]),
        // Add dummy implementations for other IStateService methods to satisfy the type
        getTextVar: vi.fn(), setTextVar: vi.fn(), getAllTextVars: vi.fn(), getLocalTextVars: vi.fn(),
        getDataVar: vi.fn(), setDataVar: vi.fn(), getAllDataVars: vi.fn(), getLocalDataVars: vi.fn(),
        getPathVar: vi.fn(), setPathVar: vi.fn(), getAllPathVars: vi.fn(),
        getCommandVar: vi.fn(), setCommandVar: vi.fn(), getAllCommands: vi.fn(),
        getVariable: vi.fn(), setVariable: vi.fn(), hasVariable: vi.fn(), removeVariable: vi.fn(),
        appendContent: vi.fn(), getTransformedNodes: vi.fn(), setTransformedNodes: vi.fn(), transformNode: vi.fn(),
        createChildState: vi.fn(), // Will be spied on initialTestState
        mergeChildState: vi.fn(), 
        getParentState: vi.fn(),
        setTransformationEnabled: vi.fn(), getTransformationOptions: vi.fn(), setTransformationOptions: vi.fn(),
        hasTransformationSupport: vi.fn().mockReturnValue(true), shouldTransform: vi.fn(),
        addImport: vi.fn(), removeImport: vi.fn(), hasImport: vi.fn(), getImports: vi.fn(),
        setEventService: vi.fn(), setTrackingService: vi.fn(),
        hasLocalChanges: vi.fn(), getLocalChanges: vi.fn(),
        setImmutable: vi.fn(), get isImmutable() { return false; },
        getCommand: vi.fn(), getCommandOutput: vi.fn(),
        getInternalStateNode: vi.fn()
      };
      // workingState.clone needs to return the same instance for this test setup
      vi.spyOn(workingState, 'clone').mockReturnValue(workingState);

      const initialTestState: IStateService = {
        // Define methods, ensure createChildState is mockable
        ...workingState, // Start with working state methods
        getStateId: vi.fn().mockReturnValue('testInitialState'),
        createChildState: vi.fn(), // Define the method we will spy on
        mergeChildState: vi.fn(), // Define mergeChildState
      };
      // Configure the relationship: initialTestState.createChildState() returns workingState
      vi.spyOn(initialTestState, 'createChildState').mockImplementation(() => workingState); 
      // --- End Manual Mock Creation --- 

      const finalState = await service.interpret([textNode], { initialState: initialTestState, mergeState: true });

      expect(initialTestState.createChildState).toHaveBeenCalledTimes(1);
      // Clone is called 3 times: initial snapshot + interpretNode Text case + loop update
      expect(workingState.clone).toHaveBeenCalledTimes(3); 
      expect(workingState.addNode).toHaveBeenCalledWith(textNode);
      expect(finalState).toBe(workingState); 
    });

    it('processes directive nodes by calling directiveService.handleDirective client', async () => {
      const directiveNode: DirectiveNode = createDirectiveNode('text', { identifier: 'test', value: 'value' });
      const initialTestState = MockFactory.createStateService({ getStateId: vi.fn().mockReturnValue('dirInitial')});
      const workingState = MockFactory.createStateService({ getStateId: vi.fn().mockReturnValue('dirWorking') });
      const clonedState = MockFactory.createStateService({ getStateId: vi.fn().mockReturnValue('dirCloned') });

      vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
      vi.spyOn(workingState, 'clone').mockReturnValue(clonedState);
      vi.spyOn(clonedState, 'addNode').mockReturnValue(undefined);

      await service.interpret([directiveNode], { initialState: initialTestState, mergeState: true });

      expect(initialTestState.createChildState).toHaveBeenCalled();
      expect(workingState.clone).toHaveBeenCalled();
      expect(directiveService.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: clonedState,
          directiveNode: directiveNode
        })
      );
    });

    it('throws MeldInterpreterError when directive service fails', async () => {
      const directiveNode: DirectiveNode = createDirectiveNode('text', {});
      const handlerError = new Error('Handler Test error');
      vi.spyOn(directiveService, 'handleDirective').mockRejectedValue(handlerError);
      
      await expect(service.interpret([directiveNode], { initialState: mockInitialState }))
            .rejects.toThrow(MeldInterpreterError);
      await expect(service.interpret([directiveNode], { initialState: mockInitialState }))
            .rejects.toHaveProperty('cause', handlerError);
    });

    it('extracts error location from node when error occurs in handler client', async () => {
        const location = createLocation(5, 10, 5, 20);
        const directiveNode: DirectiveNode = createDirectiveNode('text', {}, location);
        const testError = new Error('Handler loc Test error');
        vi.spyOn(directiveService, 'handleDirective').mockRejectedValue(testError);

        await expect(service.interpret([directiveNode], { initialState: mockInitialState }))
            .rejects.toThrow(MeldInterpreterError);
        
        try {
            await service.interpret([directiveNode], { initialState: mockInitialState });
        } catch (error) {
             expect(error).toBeInstanceOf(MeldInterpreterError);
             const meldError = error as MeldInterpreterError;
             expect(meldError.sourceLocation?.line).toEqual(location?.start.line);
             expect(meldError.sourceLocation?.column).toEqual(location?.start.column);
             expect(meldError.message).toContain('Handler loc Test error');
             expect(meldError.cause).toBe(testError);
        }
    });

    it('sets file path in working state when provided in options', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const filePath = 'test-path.meld';
      vi.spyOn(workingMockState, 'setCurrentFilePath');

      await service.interpret([textNode], { initialState: mockInitialState, filePath: filePath });
      
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(workingMockState.setCurrentFilePath).toHaveBeenCalledWith(filePath);
    });

    it('passes context to directive client', async () => {
      const location = createLocation(1, 1, 1, 12);
      const directiveNode: DirectiveNode = createDirectiveNode('text', {}, location);
      const options: InterpreterOptions = { initialState: mockInitialState, mergeState: true, filePath: 'test.meld' };
      
      const directiveWorkingState = MockFactory.createStateService();
      vi.spyOn(workingMockState, 'clone').mockReturnValue(directiveWorkingState);

      await service.interpret([directiveNode], options);
      
      expect(directiveService.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ 
            state: directiveWorkingState,
            directiveNode: directiveNode,
            resolutionContext: expect.objectContaining({ currentFilePath: 'test.mld' }),
            formattingContext: expect.objectContaining({ nodeType: 'Directive' }),
            executionContext: expect.objectContaining({ cwd: '.' })
        })
      );
    });

    it('handles command variables correctly (access on state)', async () => {
        const directiveNode: DirectiveNode = createDirectiveNode('run', { command: 'test-command' });
        const commandDef = { kind: 'basic', commandTemplate: 'echo test' } as any;
        const commandVar = { name: 'test-command', value: commandDef, type: VariableType.COMMAND } as CommandVariable;
        
        const directiveWorkingState = MockFactory.createStateService();
        vi.spyOn(workingMockState, 'clone').mockReturnValue(directiveWorkingState);
        vi.spyOn(directiveWorkingState, 'getCommandVar').mockReturnValue(commandVar);

        vi.spyOn(directiveService, 'handleDirective').mockImplementation(async (node, ctx) => {
            ctx.state.getCommandVar('test-command'); 
            return ctx.state; 
        });

        await service.interpret([directiveNode], { initialState: mockInitialState });

        expect(workingMockState.clone).toHaveBeenCalled();
        expect(directiveService.handleDirective).toHaveBeenCalled();
        expect(directiveWorkingState.getCommandVar).toHaveBeenCalledWith('test-command');
    });

    it('processes text nodes with interpolation via parser and resolution services', async () => {
        const node = createTextNode('Hello {{name}}!', createLocation(1, 1));
        const initialTestState = MockFactory.createStateService();
        const workingState = MockFactory.createStateService();
        const parsedInterpolatable: InterpolatableValue = [
            createTextNode('Hello ', createLocation(1, 1)),
            { type: 'VariableReference', identifier: 'name', valueType: 'text', isVariableReference: true, location: createLocation(1, 8) },
            createTextNode('!', createLocation(1, 14))
        ];
        const resolvedContent = 'Hello Alice!';

        vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
        vi.spyOn(workingState, 'clone').mockReturnValue(workingState);
        vi.spyOn(workingState, 'addNode').mockReturnValue(undefined);
        vi.spyOn(workingState, 'getCurrentFilePath').mockReturnValue('/interpolate/path.mld');
        vi.spyOn(parserService, 'parseString').mockResolvedValue(parsedInterpolatable);
        vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValue(resolvedContent);

        await service.interpret([node], { initialState: initialTestState });

        expect(parserService.parseString).toHaveBeenCalledWith(
            'Hello {{name}}!',
            expect.objectContaining({ filePath: '/interpolate/path.mld' })
        );
        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(
            parsedInterpolatable,
            expect.objectContaining({ currentFilePath: '/interpolate/path.mld' })
        );
        expect(workingState.addNode).toHaveBeenCalledWith(expect.objectContaining({
            type: 'Text',
            content: resolvedContent
        }));
    });
  });

  describe('state management', () => {
    it('creates child state from initial state when interpreting', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const initialTestState = MockFactory.createStateService();
      const workingState = MockFactory.createStateService({ getStateId: vi.fn().mockReturnValue('returnedWorkingState') });

      vi.spyOn(initialTestState, 'createChildState').mockResolvedValue(workingState);
      vi.spyOn(workingState, 'clone').mockReturnValue(workingState);
      vi.spyOn(workingState, 'addNode').mockReturnValue(undefined);

      await service.interpret([textNode], { initialState: initialTestState });

      expect(initialTestState.createChildState).toHaveBeenCalled();
      await service.interpret([textNode], { initialState: mockInitialState });
      expect(mockInitialState.createChildState).toHaveBeenCalled();
    });

    it('returns the final working state', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const result = await service.interpret([textNode], { initialState: mockInitialState });
      expect(result.getStateId()).toBe(workingMockState.getStateId()); 
    });

    it('handles empty node arrays (returns final working state)', async () => {
      const result = await service.interpret([], { initialState: mockInitialState });
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(workingMockState.clone).toHaveBeenCalled(); 
      expect(result.getStateId()).toBe(workingMockState.getStateId());
    });
    
    it('merges state back if mergeState is true (default)', async () => {
      const textNode: TextNode = createTextNode('Test content');
      vi.spyOn(mockInitialState, 'mergeChildState');
      
      await service.interpret([textNode], { initialState: mockInitialState /* mergeState defaults to true */ });
      
      expect(mockInitialState.mergeChildState).toHaveBeenCalledWith(workingMockState);
    });

    it('does NOT merge state back if mergeState is false', async () => {
      const textNode: TextNode = createTextNode('Test content');
      vi.spyOn(mockInitialState, 'mergeChildState');

      await service.interpret([textNode], { initialState: mockInitialState, mergeState: false });
      
      expect(mockInitialState.mergeChildState).not.toHaveBeenCalled();
    });
    
    it('creates state from internal service if no initial state provided', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const internalState = MockFactory.createStateService({ getStateId: vi.fn().mockReturnValue('internal-generated') });
      vi.spyOn(fixture.stateService, 'createChildState').mockResolvedValue(internalState);
      vi.spyOn(internalState, 'clone').mockReturnValue(internalState);
      vi.spyOn(internalState, 'addNode');

      const result = await service.interpret([textNode], { /* no initialState */ });
      
      expect(fixture.stateService.createChildState).toHaveBeenCalled();
      expect(internalState.addNode).toHaveBeenCalledWith(textNode);
      expect(result.getStateId()).toBe('internal-generated');
    });
  });

  describe('error handling', () => {
    it('does NOT wrap generic errors during state creation', async () => {
      const node: TextNode = createTextNode('Test content');
      const creationError = new Error('Generic state creation error');
      vi.spyOn(mockInitialState, 'createChildState').mockRejectedValue(creationError);
      
      await expect(service.interpret([node], { initialState: mockInitialState }))
            .rejects.toThrow(creationError);
    });
    
     it('preserves interpreter errors during state creation', async () => {
      const node: TextNode = createTextNode('Test content');
      const interpreterError = new MeldInterpreterError('State creation failed', 'STATE_ERROR');
       vi.spyOn(mockInitialState, 'createChildState').mockRejectedValue(interpreterError);
       
      await expect(service.interpret([node], { initialState: mockInitialState }))
            .rejects.toThrow(interpreterError);
    });
    
     it('wraps errors during node processing (handler fails)', async () => {
      const node: DirectiveNode = createDirectiveNode('text', {});
      const processingError = new Error('Directive processing failed');
       vi.spyOn(directiveService, 'handleDirective').mockRejectedValue(processingError);
       
      await expect(service.interpret([node], { initialState: mockInitialState }))
             .rejects.toThrow(MeldInterpreterError);
       await expect(service.interpret([node], { initialState: mockInitialState }))
             .rejects.toHaveProperty('cause', processingError);
    });

    it('extracts location from node for processing errors (handler fails)', async () => {
        const location = createLocation(5, 10, 5, 20);
        const node: DirectiveNode = createDirectiveNode('text', {}, location);
        const processingError = new Error('Directive processing failed loc');
        vi.spyOn(directiveService, 'handleDirective').mockRejectedValue(processingError);
        
        await expect(service.interpret([node], { initialState: mockInitialState }))
             .rejects.toThrow(MeldInterpreterError);

        try {
            await service.interpret([node], { initialState: mockInitialState });
        } catch (error) {
             expect(error).toBeInstanceOf(MeldInterpreterError);
             const meldError = error as MeldInterpreterError;
             expect(meldError.sourceLocation?.line).toEqual(location?.start.line);
             expect(meldError.sourceLocation?.column).toEqual(location?.start.column);
             expect(meldError.message).toContain('Directive processing failed loc');
             expect(meldError.cause).toBe(processingError);
        }
    });
    
    it('does NOT wrap errors from state.clone() (adjust expectation)', async () => {
      const node: TextNode = createTextNode('clone fail test');
      const cloneError = new Error('Clone failed');
      vi.spyOn(workingMockState, 'clone').mockImplementation(() => { throw cloneError; });

      await expect(service.interpret([node], { initialState: mockInitialState }))
            .rejects.toThrow(cloneError);
    });
  });

  describe('edge cases', () => {
    it('clones working state even on partial failure (handler fails)', async () => {
      const nodes: MeldNode[] = [
        createTextNode('test1'),
        createDirectiveNode('text', {}, createLocation(2,1))
      ];
      vi.spyOn(directiveService, 'handleDirective').mockRejectedValue(new Error('Partial fail error'));
      
      await expect(service.interpret(nodes, { initialState: mockInitialState })).rejects.toThrow(MeldInterpreterError);
      
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(workingMockState.clone).toHaveBeenCalled();
    });

    it('throws error for null node', async () => {
      await expect(service.interpret([null as unknown as MeldNode], { initialState: mockInitialState }))
            .rejects.toThrow(/Invalid node encountered/);
    });

    it('throws error for undefined node', async () => {
      await expect(service.interpret([undefined as unknown as MeldNode], { initialState: mockInitialState }))
            .rejects.toThrow(/Invalid node encountered/);
    });

    it('processes node without location', async () => {
      const node: TextNode = createTextNode('test');
      await service.interpret([node], { initialState: mockInitialState });
      expect(workingMockState.addNode).toHaveBeenCalledWith(node);
    });

    it('processes node with partial location', async () => {
      const node: TextNode = createTextNode('test', createLocation(1, 1, 1, 5));
      await service.interpret([node], { initialState: mockInitialState });
      expect(workingMockState.addNode).toHaveBeenCalledWith(node);
    });

    it('throws wrapped error on command variable processing error (in handler)', async () => {
      const node: DirectiveNode = createDirectiveNode('text', {}, createLocation(1,1));
      const cmdError = new Error('Command lookup failed');
      vi.spyOn(directiveService, 'handleDirective').mockRejectedValue(cmdError);

      await expect(service.interpret([node], { initialState: mockInitialState }))
        .rejects.toThrow(MeldInterpreterError);
      await expect(service.interpret([node], { initialState: mockInitialState }))
        .rejects.toHaveProperty('cause', cmdError);
    });

    it('throws if directive node is missing directive property', async () => {
       const node = createDirectiveNode('text', {}, createLocation(1,1));
       (node as any).directive = undefined;
       await expect(service.interpret([node], { initialState: mockInitialState }))
            .rejects.toThrow(/Invalid directive node structure/);
    });
  });

  describe('Phase 5 Refactoring Verification (Manual Setup)', () => {
    it('passes correctly structured context to directive client', async () => {
      const location = createLocation(1,1);
      const directiveNode = createDirectiveNode('run', { subtype: 'runCommand', command: 'echo hello' }, location);
      const directiveWorkingState = MockFactory.createStateService();
      vi.spyOn(workingMockState, 'clone').mockReturnValue(directiveWorkingState);
      vi.spyOn(directiveWorkingState, 'getCurrentFilePath').mockReturnValue('/test/working.mld');
      vi.spyOn(pathService, 'dirname').mockReturnValue('/test');
      
      await service.interpret([directiveNode], { initialState: mockInitialState });

      expect(directiveService.handleDirective).toHaveBeenCalledTimes(1);
      const handlerCall = directiveService.handleDirective.mock.calls[0];
      const passedNode = handlerCall[0];
      const passedContext = handlerCall[1];

      expect(passedNode).toBe(directiveNode);
      expect(passedContext).toBeDefined();
      expect(passedContext.state).toBe(directiveWorkingState);
      expect(passedContext.directiveNode).toBe(directiveNode);
      
      expect(passedContext.resolutionContext).toBeDefined();
      expect(passedContext.resolutionContext.currentFilePath).toBe('/test/working.mld'); 
      
      expect(passedContext.formattingContext).toBeDefined();
      expect(passedContext.formattingContext.nodeType).toBe('Directive');
      
      expect(passedContext.executionContext).toBeDefined();
      expect(passedContext.executionContext?.cwd).toBe('/test');
    });

    it('handles DirectiveResult with replacement node in transformation mode', async () => {
      const directiveNode = createDirectiveNode('embed', { subtype: 'embedPath', path: 'file.md' });
      const mockReplacementNode = createTextNode('Replaced Content', directiveNode.location);
      const directiveResult = {
        state: workingMockState,
        replacement: mockReplacementNode
      };
      
      vi.spyOn(workingMockState, 'isTransformationEnabled').mockReturnValue(true);
      vi.spyOn(workingMockState, 'transformNode');
      vi.spyOn(directiveService, 'handleDirective').mockResolvedValue(directiveResult);

      const finalState = await service.interpret([directiveNode], { initialState: mockInitialState });

      expect(directiveService.handleDirective).toHaveBeenCalledTimes(1);
      expect(workingMockState.transformNode).toHaveBeenCalledWith(directiveNode, mockReplacementNode);
      expect(finalState.getStateId()).toBe(workingMockState.getStateId()); 
    });

    it('handles direct IStateService return from directive client', async () => {
      const directiveNode = createDirectiveNode('text', { identifier: 'abc', value: 'def' });
      vi.spyOn(directiveService, 'handleDirective').mockResolvedValue(workingMockState);
      vi.spyOn(workingMockState, 'transformNode');

      const finalState = await service.interpret([directiveNode], { initialState: mockInitialState });

      expect(directiveService.handleDirective).toHaveBeenCalledTimes(1);
      expect(workingMockState.transformNode).not.toHaveBeenCalled();
      expect(finalState.getStateId()).toBe(workingMockState.getStateId()); 
    });

  });
}); 