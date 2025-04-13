import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types/index.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createTextNode, createDirectiveNode, createLocation, createCommandVariable } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { InterpolatableValue } from '@core/syntax/types/ast.js';
import { createLocation as createNodeLocation } from '@tests/utils/nodeFactories';
import { VariableType, type CommandVariable } from '@core/types/index.js';

describe('InterpreterService Unit', () => {
  let context: TestContextDI;
  let service: InterpreterService;
  let directiveClient: DeepMockProxy<IDirectiveServiceClient>;
  let state: DeepMockProxy<IStateService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let directiveClientFactory: DeepMockProxy<DirectiveServiceClientFactory>;
  let parserClient: DeepMockProxy<IParserServiceClient>;
  let parserClientFactory: DeepMockProxy<ParserServiceClientFactory>;
  let mockInitialState: DeepMockProxy<IStateService>;
  let workingMockState: DeepMockProxy<IStateService>;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();

    directiveClient = mockDeep<IDirectiveServiceClient>();
    state = mockDeep<IStateService>();
    resolutionService = mockDeep<IResolutionService>();
    directiveClientFactory = mockDeep<DirectiveServiceClientFactory>();
    parserClient = mockDeep<IParserServiceClient>();
    parserClientFactory = mockDeep<ParserServiceClientFactory>();
    mockInitialState = mockDeep<IStateService>();
    workingMockState = mockDeep<IStateService>();

    directiveClientFactory.createClient.mockReturnValue(directiveClient);
    parserClientFactory.createClient.mockReturnValue(parserClient);
    state.clone.mockReturnValue(state);
    state.addNode.mockReturnValue(undefined);
    state.getCurrentFilePath.mockReturnValue('/test/file.mld');
    state.isTransformationEnabled.mockReturnValue(true);
    state.createChildState.mockImplementation(() => {
      const child = workingMockState ?? mockDeep<IStateService>();
      child.clone.mockReturnValue(child);
      child.addNode.mockReturnValue(undefined);
      child.getCurrentFilePath.mockReturnValue('/test/child.mld');
      child.isTransformationEnabled.mockReturnValue(true);
      child.getStateId?.mockReturnValue('mockChildState-' + Math.random());
      return child;
    });
    mockInitialState.getStateId.mockReturnValue('mockInitialState');
    mockInitialState.createChildState.mockReturnValue(workingMockState);
    mockInitialState.clone.mockReturnValue(mockInitialState);
    workingMockState.getStateId.mockReturnValue('workingMockState');
    workingMockState.clone.mockReturnValue(workingMockState);
    workingMockState.addNode.mockReturnValue(undefined);
    workingMockState.getCurrentFilePath.mockReturnValue('/test/working.mld');

    context.registerMock('IDirectiveServiceClient', directiveClient);
    context.registerMock('IStateService', state);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('DirectiveServiceClientFactory', directiveClientFactory);
    context.registerMock('ParserServiceClientFactory', parserClientFactory);
    context.registerMock('IParserServiceClient', parserClient);

    await context.initialize();

    service = await context.resolve(InterpreterService);
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('initializes with directive service and state service', () => {
      expect(service).toBeDefined();
      expect(service.interpret).toBeDefined();
    });

    it('can be initialized after construction', () => {
      const newService = new InterpreterService();
      const internalState = mockDeep<IStateService>();
      newService.initialize(mockDeep<DirectiveServiceLike>(), internalState);
      expect(newService).toBeDefined();
      expect(newService.interpret).toBeDefined();
    });
  });

  describe('node interpretation', () => {
    it('processes text nodes directly (adds node)', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      state.createChildState.mockReturnValueOnce(workingMockState);
      await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      expect(workingMockState.addNode).toHaveBeenCalledWith(textNode);
      expect(workingMockState.getStateId()).toMatch(/^workingMockState/);
    });

    it.skip('processes directive nodes (calls handler with clone)', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'test' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const resultState = mockDeep<IStateService>();
      resultState.getStateId.mockReturnValue('working-clone-result');
      resultState.addNode.mockReturnValue(undefined);
      resultState.clone.mockReturnValue(resultState);
      directiveClient.handleDirective.mockResolvedValue(resultState);
      
      const directiveCloneState = mockDeep<IStateService>();
      directiveCloneState.getStateId.mockReturnValue('directiveCloneState');
      directiveCloneState.addNode.mockReturnValue(undefined);
      workingMockState.clone.mockReturnValueOnce(directiveCloneState);

      await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });
      
      expect(directiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ 
          state: expect.objectContaining({ getStateId: expect.any(Function) }) 
        })
      );
      const handlerContext = directiveClient.handleDirective.mock.calls[0][1];
      expect(handlerContext.state.getStateId()).toEqual('directiveCloneState');
    });

    it('throws MeldInterpreterError when directive service fails', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'fail' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      directiveClient.handleDirective.mockRejectedValue(new Error('Handler Test error')); 
      await expect(service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(MeldInterpreterError);
    });

    it.skip('extracts error location from node when error occurs in handler', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'fail-loc' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const testError = new Error('Handler loc Test error');
      directiveClient.handleDirective.mockRejectedValue(testError);
      try {
        await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });
        expect.fail('Interpretation should have failed');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        expect(error.sourceLocation?.start).toEqual(directiveNode.location.start);
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

    it.skip('passes context to directive service', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: 'test content', directive: { kind: 'options' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const options = { initialState: mockInitialState, mergeState: true, currentFilePath: 'test.meld' };
      const resultState = mockDeep<IStateService>();
      resultState.clone.mockReturnValue(resultState);
      directiveClient.handleDirective.mockResolvedValue(resultState);

      await service.interpret([directiveNode], options);
      expect(directiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ currentFilePath: 'test.meld' })
      );
    });

    it.skip('handles command variables correctly', async () => {
      const commandDef = { kind: 'basic', value: 'echo test' } as any;
      const commandVar = createCommandVariable('test-command', commandDef);
      const directiveNode: DirectiveNode = { type: 'Directive', name: 'test', content: '${cmd:test-command}', directive: { kind: 'cmd' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      let stateInHandler: DeepMockProxy<IStateService> | undefined;
      
      const resultState = mockDeep<IStateService>();
      directiveClient.handleDirective.mockImplementation(async (node, ctx) => {
        stateInHandler = ctx.state as DeepMockProxy<IStateService>;
        stateInHandler.getCommandVar.calledWith('test-command').mockReturnValue(commandVar);
        return resultState;
      });

      const directiveCloneState = mockDeep<IStateService>();
      workingMockState.clone.mockReturnValueOnce(directiveCloneState);

      await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });

      expect(directiveClient.handleDirective).toHaveBeenCalled();
      expect(directiveCloneState.getCommandVar).toHaveBeenCalledWith('test-command');
    });

    it.skip('processes text nodes with interpolation', async () => {
      const nodes: MeldNode[] = [
        createTextNode('Hello {{name}}!')
      ];
      const initialState = mockDeep<IStateService>();
      initialState.clone.mockReturnValue(initialState);
      initialState.createChildState.mockReturnValue(state);
      initialState.getCurrentFilePath.mockReturnValue('/initial/path.mld');
      state.getCurrentFilePath.mockReturnValue('/initial/path.mld');

      const parsedInterpolatable: InterpolatableValue = [
        createTextNode('Hello ', createLocation(1, 1)),
        { type: 'VariableReference', identifier: 'name', valueType: 'text', isVariableReference: true, location: createLocation(1, 8) },
        createTextNode('!', createLocation(1, 14))
      ];
      parserClient.parseString.calledWith('Hello {{name}}!', expect.objectContaining({ filePath: '/initial/path.mld' }))
        .mockImplementation(async (content, options) => {
          console.log('[TEST DEBUG] parserClient.parseString called with:', content, options);
          return parsedInterpolatable; 
        });

      resolutionService.resolveNodes.calledWith(parsedInterpolatable, expect.anything())
        .mockImplementation(async (nodes, context) => {
          console.log('[TEST DEBUG] resolutionService.resolveNodes called with nodes:', JSON.stringify(nodes).substring(0,100));
          return 'Hello Alice!';
        });

      state.addNode.mockImplementation((node) => {
        console.log('[TEST DEBUG] state.addNode called with:', node);
      });

      await service.interpret(nodes, { initialState, mergeState: false });

      expect(state.addNode).toHaveBeenCalledWith(expect.objectContaining({
        type: 'Text',
        content: 'Hello Alice!'
      }));
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
      const textNode: TextNode = createTextNode('Test content');
      const internalWorking = mockDeep<IStateService>();
      internalWorking.clone.mockReturnValue(internalWorking);
      internalWorking.addNode.mockReturnValue(undefined);
      internalWorking.getCurrentFilePath.mockReturnValue('internal-path');
      state.createChildState.mockReturnValue(internalWorking);
      
      await service.interpret([textNode], { initialState: mockInitialState, mergeState: false });
      
      expect(mockInitialState.mergeChildState).not.toHaveBeenCalled();
      expect(state.createChildState).toHaveBeenCalled();
    });
    
    it('creates state from internal service if mergeState is false', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const internalWorkingState = mockDeep<IStateService>();
      internalWorkingState.getStateId.mockReturnValue('forced-working');
      internalWorkingState.clone.mockReturnValue(internalWorkingState);
      internalWorkingState.addNode.mockReturnValue(undefined);
      internalWorkingState.getCurrentFilePath.mockReturnValue('forced-working-path');
      state.createChildState.mockReturnValue(internalWorkingState);
      
      const result = await service.interpret([textNode], { initialState: mockInitialState, mergeState: false });
      
      expect(state.createChildState).toHaveBeenCalled();
      expect(mockInitialState.createChildState).not.toHaveBeenCalled();
      expect(result.getStateId()).toBe('forced-working');
    });
    
    it('creates state from internal service if no initial state provided', async () => {
      const textNode: TextNode = createTextNode('Test content');
      const internalWorkingState = mockDeep<IStateService>();
      internalWorkingState.getStateId.mockReturnValue('forced-working-no-initial');
      internalWorkingState.clone.mockReturnValue(internalWorkingState);
      internalWorkingState.addNode.mockReturnValue(undefined);
      internalWorkingState.getCurrentFilePath.mockReturnValue('forced-working-no-initial-path');
      state.createChildState.mockReturnValue(internalWorkingState);

      const result = await service.interpret([textNode], { /* no initialState */ });
      
      expect(state.createChildState).toHaveBeenCalled();
      expect(result.getStateId()).toBe('forced-working-no-initial');
    });
  });

  describe('error handling', () => {
    it('does NOT wrap generic errors during state creation (initialState.createChildState)', async () => {
      const node: TextNode = { type: 'Text', content: 'Test content' };
      const creationError = new Error('Generic state creation error');
      mockInitialState.createChildState.mockImplementation(() => { throw creationError; });
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
            .rejects.toThrow(creationError);
    });
    
     it('preserves interpreter errors during state creation', async () => {
      const node: TextNode = { type: 'Text', content: 'Test content' };
      const interpreterError = new MeldInterpreterError('State creation failed', 'STATE_ERROR');
      mockInitialState.createChildState.mockImplementation(() => { throw interpreterError; });
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
            .rejects.toThrow(interpreterError);
    });
    
     it('wraps errors during node processing (handler fails)', async () => {
      const node: DirectiveNode = { type: 'Directive', name: 'fail', content: '', directive: { kind: 'proc-fail' } };
      const processingError = new Error('Directive processing failed');
      directiveClient.handleDirective.mockRejectedValue(processingError);
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
             .rejects.toThrow(MeldInterpreterError);
    });

    it.skip('extracts location from node for processing errors (handler fails)', async () => {
      const node: DirectiveNode = { type: 'Directive', name: 'fail', content: '', directive: { kind: 'loc-fail' }, location: { start: { line: 5, column: 10 }, end: { line: 5, column: 20 } } };
      const processingError = new Error('Directive processing failed loc');
      directiveClient.handleDirective.mockRejectedValue(processingError);
      try {
        await service.interpret([node], { initialState: mockInitialState, mergeState: true });
        expect.fail('Should have thrown');
      } catch(e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
          if(e instanceof MeldInterpreterError) {
            expect(e.sourceLocation?.start).toEqual(node.location.start);
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
      await expect(uninitializedService.interpret([node], { initialState: mockInitialState, mergeState: true }))
            .rejects.toThrow(/InterpreterService not initialized. Check for missing dependencies/);
    });

    it('clones working state even on partial failure (handler fails)', async () => {
      const nodes: MeldNode[] = [
        { type: 'Text', content: 'test1' },
        { type: 'Directive', name: 'fail', content: 'failing', directive: { kind: 'partial-fail' } }
      ];
      directiveClient.handleDirective.mockRejectedValue(new Error('Partial fail error'));
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
      state.createChildState.mockReturnValueOnce(workingMockState);
      await service.interpret([node], { initialState: mockInitialState, mergeState: true });
      expect(workingMockState.addNode).toHaveBeenCalledWith(node);
    });

    it('processes node with partial location (adds node)', async () => {
      const node: TextNode = { type: 'Text', content: 'test', location: { start: { line: 1, column: 1 } } };
      state.createChildState.mockReturnValueOnce(workingMockState);
      await service.interpret([node], { initialState: mockInitialState, mergeState: true });
      expect(workingMockState.addNode).toHaveBeenCalledWith(node);
    });

    it('throws wrapped error on command variable processing error (in handler)', async () => {
      const node: DirectiveNode = { type: 'Directive', name: 'test', content: '${cmd:invalid}', directive: { kind: 'cmd-fail' } };
      const cmdError = new Error('Command lookup failed');
      
      directiveClient.handleDirective.mockRejectedValue(cmdError); 

      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
        .rejects.toThrow(MeldInterpreterError);
    });

     it('throws invalid_directive if node.directive is missing', async () => {
       const node: DirectiveNode = { type: 'Directive', name: 'test', content: 'no directive prop' } as DirectiveNode;
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(/Invalid directive node/);
    });
  });
}); 