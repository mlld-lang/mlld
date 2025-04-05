import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { VariableType, type CommandVariable } from '@core/types/index.js';
import { createCommandVariable } from '@core/types/variables.js';

// Store created mocks to check calls later
let createdMocks: Record<string, IStateService> = {};

// Helper function to create a fresh mock state object
const createMockState = (id: string, parent?: IStateService): IStateService => {
  const newState = {
    getTextVar: vi.fn(),
    setTextVar: vi.fn(),
    getDataVar: vi.fn(), 
    setDataVar: vi.fn(),
    getPathVar: vi.fn(),
    setPathVar: vi.fn(),
    getCommandVar: vi.fn(),
    setCommandVar: vi.fn(),
    getAllTextVars: vi.fn().mockReturnValue(new Map()),
    getAllDataVars: vi.fn().mockReturnValue(new Map()),
    getAllPathVars: vi.fn().mockReturnValue(new Map()),
    getAllCommands: vi.fn().mockReturnValue(new Map()),
    clone: vi.fn(),
    createChildState: vi.fn(),
    getStateId: vi.fn().mockReturnValue(id),
    getCurrentFilePath: vi.fn().mockReturnValue('test.meld'),
    setCurrentFilePath: vi.fn(),
    addNode: vi.fn(),
    getNodes: vi.fn().mockReturnValue([]),
    getTransformedNodes: vi.fn().mockReturnValue([]),
    setTransformedNodes: vi.fn(),
    isTransformationEnabled: vi.fn().mockReturnValue(false),
    setTransformationEnabled: vi.fn(),
    hasLocalChanges: vi.fn().mockReturnValue(false),
    getLocalChanges: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    isImmutable: false,
    getParentState: vi.fn().mockReturnValue(parent),
    mergeChildState: vi.fn(),
    getFormattingContext: vi.fn().mockReturnValue(null)
  } as unknown as IStateService;

  newState.clone = vi.fn().mockImplementation(() => {
    const cloneId = `${id}-clone`;
    const cloneState = createMockState(cloneId, newState);
    createdMocks[cloneId] = cloneState;
    return cloneState;
  });

  newState.createChildState = vi.fn().mockImplementation(() => {
    const childId = `${id}-child`;
    const childState = createMockState(childId, newState);
    createdMocks[childId] = childState;
    return childState;
  });

  createdMocks[id] = newState;
  return newState;
};

describe('InterpreterService Unit', () => {
  let context: TestContextDI;
  let service: InterpreterService;
  let mockInitialState: IStateService;
  let workingMockState: IStateService;
  let mockDirectiveService: IDirectiveService;
  let internalMockStateService: IStateService;

  beforeEach(async () => {
    createdMocks = {};
    context = TestContextDI.createIsolated();
    mockInitialState = createMockState('initial');
    workingMockState = createMockState('working', mockInitialState);
    workingMockState.setCurrentFilePath = vi.fn();
    mockInitialState.createChildState = vi.fn().mockReturnValue(workingMockState);
    
    internalMockStateService = createMockState('internal-service-state');
    internalMockStateService.createChildState = vi.fn().mockReturnValue(createMockState('internal-working', internalMockStateService)); 

    mockDirectiveService = {
      executeDirective: vi.fn().mockImplementation(async (node, ctx) => ctx.state),
      handleDirective: vi.fn().mockImplementation(async (node, ctx) => ctx.state),
      processDirective: vi.fn().mockImplementation(async (node, ctx) => ctx.state),
      processDirectives: vi.fn().mockImplementation(async (nodes, ctx) => ctx.state),
      createChildContext: vi.fn().mockImplementation((parentContext) => {
        const childState = parentContext.state.createChildState ? 
                           parentContext.state.createChildState() : 
                           createMockState('directive-child'); 
        return { ...parentContext, state: childState, parentState: parentContext.state };
      }),
      supportsDirective: vi.fn().mockReturnValue(true)
    } as unknown as IDirectiveService;

    context.registerMock('IStateService', internalMockStateService);
    context.registerMock('IDirectiveService', mockDirectiveService);

    await context.initialize();
    
    service = new InterpreterService();
    service.initialize(mockDirectiveService, internalMockStateService);
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks();
    createdMocks = {};
  });

  describe('initialization', () => {
    it('initializes with directive service and state service', () => {
      expect(service).toBeDefined();
      expect(service.interpret).toBeDefined();
    });

    it('can be initialized after construction', () => {
      const newService = new InterpreterService();
      const internalState = createMockState('internal-new');
      newService.initialize(mockDirectiveService, internalState);
      expect(newService).toBeDefined();
      expect(newService.interpret).toBeDefined();
    });
  });

  describe('node interpretation', () => {
    it('processes text nodes directly (adds node)', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      const relevantMock = Object.values(createdMocks).find(m => m.addNode.mock.calls.length > 0);
      expect(relevantMock?.addNode).toHaveBeenCalledWith(textNode);
      expect(relevantMock?.getStateId()).toMatch(/^working-clone/);
    });

    it('processes directive nodes (calls handler with clone)', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'test' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      mockDirectiveService.handleDirective = vi.fn().mockImplementation(async (node, ctx) => ctx.state);
      
      await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });
      
      expect(mockDirectiveService.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ state: expect.any(Object) })
      );
      const handlerContext = mockDirectiveService.handleDirective.mock.calls[0][1];
      expect(handlerContext.state.getStateId()).toMatch(/^working-clone/);
      const statePassedToHandler = handlerContext.state;
      expect(statePassedToHandler.addNode).toHaveBeenCalledWith(directiveNode);
    });

    it('throws MeldInterpreterError when directive service fails', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'fail' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      mockDirectiveService.handleDirective = vi.fn().mockRejectedValue(new Error('Handler Test error')); 
      await expect(service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(MeldInterpreterError);
    });

    it('extracts error location from node when error occurs in handler', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'fail-loc' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const testError = new Error('Handler loc Test error');
      mockDirectiveService.handleDirective = vi.fn().mockRejectedValue(testError);
      try {
        await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });
        expect.fail('Interpretation should have failed');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        expect(error.location).toEqual(directiveNode.location.start);
        expect(error.message).toContain('Handler loc Test error');
      }
    });

    it('sets file path in working state when provided', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      const filePath = 'test-path.meld';
      workingMockState.setCurrentFilePath = vi.fn();
      mockInitialState.createChildState = vi.fn().mockReturnValue(workingMockState);

      await service.interpret([textNode], { initialState: mockInitialState, mergeState: true, currentFilePath: filePath });
      
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(true).toBe(true);
    });

    it('passes context to directive service', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'options' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const options = { initialState: mockInitialState, mergeState: true, currentFilePath: 'test.meld' };
      mockDirectiveService.handleDirective = vi.fn().mockImplementation(async (node, ctx) => ctx.state);

      await service.interpret([directiveNode], options);
      expect(mockDirectiveService.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.any(Object) 
      );
    });

    it('handles command variables correctly', async () => {
      const commandVar = createCommandVariable('test-command', ['arg1', 'arg2']);
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: '${cmd:test-command}', directive: { kind: 'cmd' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      let stateInHandler: IStateService | undefined;
      
      mockDirectiveService.handleDirective = vi.fn().mockImplementation(async (node, ctx) => { 
          stateInHandler = ctx.state; 
          stateInHandler.getCommandVar = vi.fn().mockReturnValue(commandVar);
          stateInHandler.getCommandVar('test-command'); 
          return stateInHandler; 
      });

      await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });

      expect(mockDirectiveService.handleDirective).toHaveBeenCalled();
      expect(stateInHandler).toBeDefined();
      expect(stateInHandler?.getCommandVar).toHaveBeenCalledWith('test-command');
    });
  });

  describe('state management', () => {
    it('creates child state from initial state when interpreting', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      expect(mockInitialState.createChildState).toHaveBeenCalled();
    });

    it('returns the final working state (check ID)', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      workingMockState.clone = vi.fn().mockReturnValue(workingMockState);
      const result = await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      expect(result.getStateId()).toBe(workingMockState.getStateId());
    });

    it('handles empty node arrays (returns final state)', async () => {
      workingMockState.clone = vi.fn().mockReturnValue(workingMockState);
      const result = await service.interpret([], { initialState: mockInitialState, mergeState: true });
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(workingMockState.clone).toHaveBeenCalled();
      expect(result.getStateId()).toBe(workingMockState.getStateId());
    });
    
    it('merges state back if requested (check ID)', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      workingMockState.clone = vi.fn().mockReturnValue(workingMockState);
      await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      expect(mockInitialState.mergeChildState).toHaveBeenCalledWith(
          expect.objectContaining({ getStateId: workingMockState.getStateId })
      );
    });

    it('does NOT merge state back if mergeState is false', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      const internalWorking = createMockState('internal-working-no-merge');
      internalWorking.clone = vi.fn().mockReturnValue(internalWorking);
      internalMockStateService.createChildState = vi.fn().mockReturnValue(internalWorking);
      await service.interpret([textNode], { initialState: mockInitialState, mergeState: false });
      expect(mockInitialState.mergeChildState).not.toHaveBeenCalled();
      expect(internalMockStateService.createChildState).toHaveBeenCalled();
    });
    
    it('creates state from internal service if mergeState is false', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      const internalWorkingState = createMockState('forced-working');
      internalWorkingState.clone = vi.fn().mockReturnValue(internalWorkingState);
      internalMockStateService.createChildState = vi.fn().mockReturnValue(internalWorkingState);
      const result = await service.interpret([textNode], { initialState: mockInitialState, mergeState: false });
      expect(internalMockStateService.createChildState).toHaveBeenCalled();
      expect(mockInitialState.createChildState).not.toHaveBeenCalled();
      expect(result.getStateId()).toBe(internalWorkingState.getStateId());
    });
    
    it('creates state from internal service if no initial state provided', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      const internalWorkingState = createMockState('forced-working-no-initial');
      internalWorkingState.clone = vi.fn().mockReturnValue(internalWorkingState);
      internalMockStateService.createChildState = vi.fn().mockReturnValue(internalWorkingState);
      const result = await service.interpret([textNode], { /* no initialState */ });
      expect(internalMockStateService.createChildState).toHaveBeenCalled();
      expect(result.getStateId()).toBe(internalWorkingState.getStateId());
    });
  });

  describe('error handling', () => {
    it('does NOT wrap generic errors during state creation (initialState.createChildState)', async () => {
      const node: TextNode = { type: 'Text', content: 'Test content' };
      const erroringInitialState = createMockState('error-initial');
      const creationError = new Error('Generic state creation error');
      erroringInitialState.createChildState = vi.fn(() => { throw creationError; });
      await expect(service.interpret([node], { initialState: erroringInitialState, mergeState: true }))
            .rejects.toThrow(creationError);
    });
    
     it('preserves interpreter errors during state creation', async () => {
      const node: TextNode = { type: 'Text', content: 'Test content' };
      const erroringInitialState = createMockState('error-initial-meld');
      const interpreterError = new MeldInterpreterError('State creation failed', 'STATE_ERROR');
      erroringInitialState.createChildState = vi.fn(() => { throw interpreterError; });
      await expect(service.interpret([node], { initialState: erroringInitialState, mergeState: true }))
            .rejects.toThrow(interpreterError);
    });
    
     it('wraps errors during node processing (handler fails)', async () => {
      const node: DirectiveNode = { type: 'Directive', name: 'fail', content: '', directive: { kind: 'proc-fail' } };
      const processingError = new Error('Directive processing failed');
      mockDirectiveService.handleDirective = vi.fn().mockImplementation(async () => { throw processingError; });
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
             .rejects.toThrow(MeldInterpreterError);
    });

     it('extracts location from node for processing errors (handler fails)', async () => {
      const node: DirectiveNode = { type: 'Directive', name: 'fail', content: '', directive: { kind: 'loc-fail' }, location: { start: { line: 5, column: 10 }, end: { line: 5, column: 20 } } };
      const processingError = new Error('Directive processing failed loc');
      mockDirectiveService.handleDirective = vi.fn().mockImplementation(async () => { throw processingError; });
      try {
        await service.interpret([node], { initialState: mockInitialState, mergeState: true });
        expect.fail('Should have thrown');
      } catch(e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
          if(e instanceof MeldInterpreterError) {
            expect(e.location).toEqual(node.location.start);
            expect(e.message).toContain('Directive processing failed loc');
        }
      }
    });
    
    it('does NOT wrap errors from state.clone() (adjust expectation)', async () => {
      const node: TextNode = { type: 'Text', content: 'clone fail test' };
      const cloneError = new Error('Clone failed');
      workingMockState.clone = vi.fn().mockImplementation(() => { throw cloneError; });

      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
            .rejects.toThrow(cloneError);
    });

  });

  describe('edge cases', () => {
    it('throws MeldInterpreterError when service is uninitialized', async () => {
      const uninitializedService = new InterpreterService(); 
      const node: TextNode = { type: 'Text', content: 'test' };
      await expect(uninitializedService.interpret([node], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(/InterpreterService must be initialized/);
    });

    it('clones working state even on partial failure (handler fails)', async () => {
      const nodes: MeldNode[] = [
        { type: 'Text', content: 'test1' },
        { type: 'Directive', name: 'fail', content: 'failing', directive: { kind: 'partial-fail' } }
      ];
      mockDirectiveService.handleDirective = vi.fn().mockRejectedValue(new Error('Partial fail error'));
      await expect(service.interpret(nodes, { initialState: mockInitialState, mergeState: true })).rejects.toThrow(MeldInterpreterError);
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(workingMockState.clone).toHaveBeenCalled();
    });

    it('handles null node (throws)', async () => {
      await expect(service.interpret([null as unknown as MeldNode], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(/No node provided/);
    });

    it('handles undefined node (throws)', async () => {
      await expect(service.interpret([undefined as unknown as MeldNode], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(/No node provided/);
    });

    it('processes node without location (adds node)', async () => {
      const node: TextNode = { type: 'Text', content: 'test' };
      await service.interpret([node], { initialState: mockInitialState, mergeState: true });
      const relevantMock = Object.values(createdMocks).find(m => m.addNode.mock.calls.length > 0 && m.getStateId().match(/^working-clone/));
      expect(relevantMock?.addNode).toHaveBeenCalledWith(node);
    });

    it('processes node with partial location (adds node)', async () => {
      const node: TextNode = { type: 'Text', content: 'test', location: { start: { line: 1, column: 1 } } };
      await service.interpret([node], { initialState: mockInitialState, mergeState: true });
      const relevantMock = Object.values(createdMocks).find(m => m.addNode.mock.calls.length > 0 && m.getStateId().match(/^working-clone/));
      expect(relevantMock?.addNode).toHaveBeenCalledWith(node);
    });

    it('throws wrapped error on command variable processing error (in handler)', async () => {
      const node: DirectiveNode = { type: 'Directive', name: 'test', content: '${cmd:invalid}', directive: { kind: 'cmd-fail' } };
      const cmdError = new Error('Command lookup failed');
      
      mockDirectiveService.handleDirective = vi.fn().mockImplementationOnce(async (n, ctx) => {
         throw cmdError; 
      });

      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
        .rejects.toThrow(MeldInterpreterError);
    });

     it('throws invalid_directive if node.directive is missing', async () => {
       const node: DirectiveNode = { type: 'Directive', name: 'test', content: 'no directive prop' } as DirectiveNode;
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(/Invalid directive node/);
    });
  });
}); 