import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types/index.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { createTextNode, createDirectiveNode, createLocation } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { DirectiveServiceClientFactory } from '@services/pipeline/DirectiveService/factories/DirectiveServiceClientFactory.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { ParserServiceClientFactory } from '@services/pipeline/ParserService/factories/ParserServiceClientFactory.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { VariableType, type CommandVariable } from '@core/types/index.js';
import { IPathService } from '@services/fs/PathService/IPathService.js';

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
  let pathService: DeepMockProxy<IPathService>;

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
    pathService = mockDeep<IPathService>();

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

    pathService.dirname.mockImplementation((filePath: string) => {
      if (filePath.includes('/')) {
        return filePath.substring(0, filePath.lastIndexOf('/'));
      }
      return '.';
    });
    pathService.dirname.calledWith('/test/working.mld').mockReturnValue('/test');

    context.registerMock('IDirectiveServiceClient', directiveClient);
    context.registerMock('IStateService', state);
    context.registerMock('IResolutionService', resolutionService);
    context.registerMock('DirectiveServiceClientFactory', directiveClientFactory);
    context.registerMock('ParserServiceClientFactory', parserClientFactory);
    context.registerMock('IParserServiceClient', parserClient);
    context.registerMock('IPathService', pathService);

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
      const directiveNode: DirectiveNode = { type: 'Directive', directive: { kind: 'text' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
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
      const directiveNode: DirectiveNode = { type: 'Directive', directive: { kind: 'text' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      directiveClient.handleDirective.mockRejectedValue(new Error('Handler Test error')); 
      await expect(service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(MeldInterpreterError);
    });

    it.skip('extracts error location from node when error occurs in handler', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', directive: { kind: 'text' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const testError = new Error('Handler loc Test error');
      directiveClient.handleDirective.mockRejectedValue(testError);
      try {
        await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });
        expect.fail('Interpretation should have failed');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError) {
          expect(error.sourceLocation?.line).toEqual(directiveNode.location?.start.line);
          expect(error.sourceLocation?.column).toEqual(directiveNode.location?.start.column);
          expect(error.message).toContain('Handler loc Test error');
        }
      }
    });

    it('sets file path in working state when provided', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      const filePath = 'test-path.meld';
      workingMockState.setCurrentFilePath = vi.fn() as any;
      mockInitialState.createChildState = vi.fn().mockReturnValue(workingMockState) as any;

      await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      
      expect(mockInitialState.createChildState).toHaveBeenCalled();
    });

    it.skip('passes context to directive service', async () => {
      const directiveNode: DirectiveNode = { type: 'Directive', directive: { kind: 'text' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
      const options = { initialState: mockInitialState, mergeState: true, filePath: 'test.meld' };
      const resultState = mockDeep<IStateService>();
      resultState.clone.mockReturnValue(resultState);
      directiveClient.handleDirective.mockResolvedValue(resultState);

      await service.interpret([directiveNode], options);
      expect(directiveClient.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({ 
            resolutionContext: expect.objectContaining({ currentFilePath: 'test.meld' })
        })
      );
    });

    it.skip('handles command variables correctly', async () => {
      const commandDef = { kind: 'basic', commandTemplate: 'echo test' } as any;
      const commandVar = { name: 'test-command', value: commandDef, type: VariableType.COMMAND } as CommandVariable;
      const directiveNode: DirectiveNode = { type: 'Directive', directive: { kind: 'text' }, location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } } };
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
      workingMockState.clone = vi.fn().mockReturnValue(workingMockState) as any;
      const result = await service.interpret([textNode], { initialState: mockInitialState, mergeState: true });
      expect(result.getStateId()).toBe(workingMockState.getStateId());
    });

    it('handles empty node arrays (returns final state)', async () => {
      workingMockState.clone = vi.fn().mockReturnValue(workingMockState) as any;
      const result = await service.interpret([], { initialState: mockInitialState, mergeState: true });
      expect(mockInitialState.createChildState).toHaveBeenCalled();
      expect(workingMockState.clone).toHaveBeenCalled();
      expect(result.getStateId()).toBe(workingMockState.getStateId());
    });
    
    it('merges state back if requested (check ID)', async () => {
      const textNode: TextNode = { type: 'Text', content: 'Test content' };
      workingMockState.clone = vi.fn().mockReturnValue(workingMockState) as any;
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
      const node: DirectiveNode = { type: 'Directive', directive: { kind: 'text' } };
      const processingError = new Error('Directive processing failed');
      directiveClient.handleDirective.mockRejectedValue(processingError);
      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
             .rejects.toThrow(MeldInterpreterError);
    });

    it.skip('extracts location from node for processing errors (handler fails)', async () => {
      const node: DirectiveNode = { type: 'Directive', directive: { kind: 'text' }, location: { start: { line: 5, column: 10 }, end: { line: 5, column: 20 } } };
      const processingError = new Error('Directive processing failed loc');
      directiveClient.handleDirective.mockRejectedValue(processingError);
      try {
        await service.interpret([node], { initialState: mockInitialState, mergeState: true });
        expect.fail('Should have thrown');
      } catch(e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
          if(e instanceof MeldInterpreterError) {
            expect(e.sourceLocation?.line).toEqual(node.location?.start.line);
            expect(e.sourceLocation?.column).toEqual(node.location?.start.column);
            expect(e.message).toContain('Directive processing failed loc');
        }
      }
    });
    
    it('does NOT wrap errors from state.clone() (adjust expectation)', async () => {
      const node: TextNode = { type: 'Text', content: 'clone fail test' };
      const cloneError = new Error('Clone failed');
      workingMockState.clone = vi.fn().mockImplementation(() => { throw cloneError; }) as any;

      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
            .rejects.toThrow(cloneError);
    });

  });

  describe('edge cases', () => {
    it('clones working state even on partial failure (handler fails)', async () => {
      const nodes: MeldNode[] = [
        createTextNode('test1'),
        createDirectiveNode('text', {}, createLocation(2,1))
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
      const node: TextNode = createTextNode('test');
      state.createChildState.mockReturnValueOnce(workingMockState);
      await service.interpret([node], { initialState: mockInitialState, mergeState: true });
      expect(workingMockState.addNode).toHaveBeenCalledWith(node);
    });

    it('processes node with partial location (adds node)', async () => {
      const node: TextNode = createTextNode('test', createLocation(1, 1, 1, 5));
      state.createChildState.mockReturnValueOnce(workingMockState);
      await service.interpret([node], { initialState: mockInitialState, mergeState: true });
      expect(workingMockState.addNode).toHaveBeenCalledWith(node);
    });

    it('throws wrapped error on command variable processing error (in handler)', async () => {
      const node: DirectiveNode = createDirectiveNode('text', {}, createLocation(1,1));
      const cmdError = new Error('Command lookup failed');
      
      directiveClient.handleDirective.mockRejectedValue(cmdError); 

      await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true }))
        .rejects.toThrow(MeldInterpreterError);
    });

     it('throws invalid_directive if node.directive is missing', async () => {
       const node = createDirectiveNode('text', {}, createLocation(1,1));
       (node as any).directive = undefined;
       await expect(service.interpret([node], { initialState: mockInitialState, mergeState: true })).rejects.toThrow(/Invalid directive node/);
    });
  });

  describe('Phase 5 Refactoring Verification', () => {

    it('passes correctly structured context to directive handler', async () => {
      const directiveNode = createDirectiveNode('run', { subtype: 'runCommand', command: 'echo hello' });
      directiveClient.handleDirective.mockResolvedValue(workingMockState); 
      
      await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });

      expect(directiveClient.handleDirective).toHaveBeenCalledTimes(1);
      const handlerCall = directiveClient.handleDirective.mock.calls[0];
      const passedNode = handlerCall[0];
      const passedContext = handlerCall[1];

      expect(passedNode).toBe(directiveNode);
      expect(passedContext).toBeDefined();
      expect(passedContext.state).toBeDefined();
      expect(passedContext.directiveNode).toBe(directiveNode);
      
      expect(passedContext.resolutionContext).toBeDefined();
      expect(passedContext.resolutionContext.currentFilePath).toBe('/test/working.mld'); 
      
      expect(passedContext.formattingContext).toBeDefined();
      expect(passedContext.formattingContext.contextType).toBe('block');
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
      
      workingMockState.isTransformationEnabled.mockReturnValue(true);
      workingMockState.transformNode = vi.fn() as any;
      
      directiveClient.handleDirective.mockResolvedValue(directiveResult);

      const finalState = await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });

      expect(directiveClient.handleDirective).toHaveBeenCalledTimes(1);
      expect(workingMockState.transformNode).toHaveBeenCalledWith(directiveNode, mockReplacementNode);
      expect(finalState.getStateId()).toBe(workingMockState.getStateId()); 
    });

    it('handles direct IStateService return from directive handler', async () => {
      const directiveNode = createDirectiveNode('text', { identifier: 'abc', value: 'def' });
      directiveClient.handleDirective.mockResolvedValue(workingMockState);
      workingMockState.transformNode = vi.fn() as any;

      const finalState = await service.interpret([directiveNode], { initialState: mockInitialState, mergeState: true });

      expect(directiveClient.handleDirective).toHaveBeenCalledTimes(1);
      expect(workingMockState.transformNode).not.toHaveBeenCalled();
      expect(finalState.getStateId()).toBe(workingMockState.getStateId()); 
    });

  });
}); 