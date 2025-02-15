import { describe, it, expect, beforeEach, vi, Vi } from 'vitest';
import { InterpreterService } from './InterpreterService';
import { DirectiveService } from '../DirectiveService/DirectiveService';
import { StateService } from '../StateService/StateService';
import { MeldInterpreterError } from '../../core/errors/MeldInterpreterError';
import { MeldNode, MeldDirective, MeldText } from '../../../core/types';

// Mock dependencies
vi.mock('../../DirectiveService/DirectiveService');
vi.mock('../../StateService/StateService');

describe('InterpreterService Unit', () => {
  let service: InterpreterService;
  let mockDirectiveService: Vi.Mocked<DirectiveService>;
  let mockStateService: Vi.Mocked<StateService>;

  beforeEach((): void => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock instances
    mockDirectiveService = {
      initialize: vi.fn(),
      processDirective: vi.fn(),
      handleDirective: vi.fn(),
      validateDirective: vi.fn(),
      createChildContext: vi.fn(),
      processDirectives: vi.fn(),
      supportsDirective: vi.fn(),
      getSupportedDirectives: vi.fn(),
      updateInterpreterService: vi.fn(),
      registerHandler: vi.fn(),
      hasHandler: vi.fn()
    } as unknown as Vi.Mocked<DirectiveService>;

    mockStateService = {
      createChildState: vi.fn().mockReturnValue({
        setCurrentFilePath: vi.fn(),
        getCurrentFilePath: vi.fn(),
        addNode: vi.fn(),
        mergeChildState: vi.fn(),
        clone: vi.fn(),
        getTextVar: vi.fn(),
        getDataVar: vi.fn(),
        getNodes: vi.fn(),
        setImmutable: vi.fn(),
        setTextVar: vi.fn()
      }),
      addNode: vi.fn(),
      mergeStates: vi.fn(),
      setCurrentFilePath: vi.fn(),
      getCurrentFilePath: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getNodes: vi.fn(),
      setImmutable: vi.fn(),
      setTextVar: vi.fn(),
      clone: vi.fn(),
      mergeChildState: vi.fn()
    } as unknown as Vi.Mocked<StateService>;

    // Initialize service
    service = new InterpreterService();
    service.initialize(mockDirectiveService, mockStateService);
  });

  describe('initialization', () => {
    it('initializes with required services', (): void => {
      expect(service).toBeDefined();
      expect(service['directiveService']).toBe(mockDirectiveService);
      expect(service['stateService']).toBe(mockStateService);
    });

    it('throws if initialized without required services', async (): Promise<void> => {
      const uninitializedService = new InterpreterService();
      await expect(() => uninitializedService.interpret([])).rejects.toThrow('InterpreterService must be initialized before use');
    });
  });

  describe('node interpretation', () => {
    it('processes text nodes directly', async (): Promise<void> => {
      const textNode: MeldText = {
        type: 'Text',
        content: 'Hello world',
        location: { line: 1, column: 1 }
      };

      await service.interpret([textNode]);
      expect(mockStateService.addNode).toHaveBeenCalledWith(textNode);
    });

    it('delegates directive nodes to directive service', async (): Promise<void> => {
      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      mockDirectiveService.processDirective.mockResolvedValueOnce(undefined);

      await service.interpret([directiveNode]);
      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.any(Object)
      );
      expect(mockStateService.addNode).toHaveBeenCalledWith(directiveNode);
    });

    it('throws on unknown node types', async (): Promise<void> => {
      const unknownNode = {
        type: 'Unknown',
        location: { line: 1, column: 1 }
      } as unknown as MeldNode;

      await expect(service.interpret([unknownNode])).rejects.toThrow(/unknown node type/i);
    });
  });

  describe('state management', () => {
    it('creates new state for each interpretation', async () => {
      const nodes: MeldNode[] = [{
        type: 'Text',
        content: 'test',
        location: { line: 1, column: 1 }
      }];

      mockStateService.createChildState.mockReturnValue(new StateService());

      await service.interpret(nodes);
      expect(mockStateService.createChildState).toHaveBeenCalled();
    });

    it('uses provided initial state when specified', async () => {
      const nodes: MeldNode[] = [{
        type: 'Text',
        content: 'test',
        location: { line: 1, column: 1 }
      }];

      const initialState = new StateService();
      mockStateService.createChildState.mockReturnValue(initialState);

      await service.interpret(nodes, { initialState });
      expect(mockStateService.createChildState).toHaveBeenCalledWith(initialState);
    });

    it('merges state when specified', async () => {
      const nodes: MeldNode[] = [{
        type: 'Text',
        content: 'test',
        location: { line: 1, column: 1 }
      }];

      const initialState = new StateService();
      mockStateService.createChildState.mockReturnValue(initialState);
      mockStateService.mergeStates.mockReturnValue(new StateService());

      await service.interpret(nodes, {
        initialState,
        mergeState: true
      });

      expect(mockStateService.mergeStates).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('wraps non-interpreter errors', async (): Promise<void> => {
      const error = new Error('Test error');
      mockDirectiveService.processDirective.mockRejectedValueOnce(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await expect(service.interpret([directiveNode])).rejects.toThrow(MeldInterpreterError);
    });

    it('preserves interpreter errors', async (): Promise<void> => {
      const error = new MeldInterpreterError('Test error');
      mockDirectiveService.processDirective.mockRejectedValueOnce(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await expect(service.interpret([directiveNode])).rejects.toThrow(error);
    });

    it('includes node location in errors', async (): Promise<void> => {
      const error = new Error('Test error');
      mockDirectiveService.processDirective.mockRejectedValueOnce(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 42, column: 10 }, end: { line: 42, column: 30 } }
      };

      try {
        await service.interpret([directiveNode]);
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError) {
          expect(e.location).toEqual({ start: { line: 42, column: 10 }, end: { line: 42, column: 30 } });
        }
      }
    });
  });

  describe('options handling', () => {
    it('sets file path in state when provided', async () => {
      const nodes: MeldNode[] = [{
        type: 'Text',
        content: 'test',
        location: { line: 1, column: 1 }
      }];

      const childState = new StateService();
      mockStateService.createChildState.mockReturnValue(childState);

      await service.interpret(nodes, {
        filePath: 'test.meld'
      });

      expect(mockStateService.setCurrentFilePath).toHaveBeenCalledWith('test.meld');
    });

    it('passes options to directive service', async () => {
      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      const options = {
        filePath: 'test.meld',
        someOption: 'value'
      };

      await service.interpret([directiveNode], options);

      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining(options)
      );
    });
  });
}); 