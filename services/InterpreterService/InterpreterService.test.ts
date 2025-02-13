import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterpreterService } from './InterpreterService';
import type { MeldNode } from 'meld-spec';
import { MeldInterpreterError } from '../../core/errors/MeldInterpreterError';

describe('InterpreterService', () => {
  let service: InterpreterService;
  let mockDirectiveService: any;
  let mockStateService: any;
  let mockChildState: any;

  beforeEach(() => {
    mockChildState = {
      setCurrentFilePath: vi.fn(),
      addNode: vi.fn(),
      mergeChildState: vi.fn()
    };

    mockStateService = {
      createChildState: vi.fn().mockReturnValue(mockChildState),
      setCurrentFilePath: vi.fn(),
      addNode: vi.fn(),
      mergeChildState: vi.fn()
    };

    mockDirectiveService = {
      processDirective: vi.fn()
    };

    service = new InterpreterService();
    service.initialize(mockDirectiveService, mockStateService);
  });

  describe('Service initialization', () => {
    it('should initialize with required services', () => {
      expect(() => service.interpret([])).not.toThrow();
    });

    it('should throw if used before initialization', () => {
      const uninitializedService = new InterpreterService();
      expect(() => uninitializedService.interpret([])).toThrow();
    });
  });

  describe('Node interpretation', () => {
    it('should handle text nodes', async () => {
      const node: MeldNode = {
        type: 'text',
        content: 'Hello world',
        location: { start: { line: 1, column: 1 } }
      };

      await service.interpretNode(node, mockStateService);
      expect(mockStateService.addNode).toHaveBeenCalledWith(node);
    });

    it('should handle directive nodes', async () => {
      const node: MeldNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        },
        location: { start: { line: 1, column: 1 } }
      };

      await service.interpretNode(node, mockStateService);
      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(node);
    });

    it('should throw on unknown node types', async () => {
      const node = {
        type: 'unknown',
        content: 'test'
      } as any;

      await expect(service.interpretNode(node, mockStateService))
        .rejects.toThrow(MeldInterpreterError);
    });
  });

  describe('Sequence interpretation', () => {
    it('should process multiple nodes in sequence', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'text',
          content: 'Hello',
          location: { start: { line: 1, column: 1 } }
        },
        {
          type: 'directive',
          directive: {
            kind: 'text',
            name: 'greeting',
            value: 'Hello'
          },
          location: { start: { line: 2, column: 1 } }
        }
      ];

      await service.interpret(nodes);

      expect(mockChildState.addNode).toHaveBeenCalled();
      expect(mockDirectiveService.processDirective).toHaveBeenCalled();
    });

    it('should use provided initial state', async () => {
      const initialState = {
        setCurrentFilePath: vi.fn(),
        addNode: vi.fn(),
        mergeChildState: vi.fn()
      };

      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Hello'
      }];

      await service.interpret(nodes, { initialState });

      expect(initialState.addNode).toHaveBeenCalled();
      expect(mockStateService.createChildState).not.toHaveBeenCalled();
    });

    it('should set file path when provided', async () => {
      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Hello'
      }];

      await service.interpret(nodes, { filePath: 'test.md' });

      expect(mockChildState.setCurrentFilePath).toHaveBeenCalledWith('test.md');
    });

    it('should merge state when specified', async () => {
      const initialState = {
        setCurrentFilePath: vi.fn(),
        addNode: vi.fn(),
        mergeChildState: vi.fn()
      };

      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Hello'
      }];

      await service.interpret(nodes, { 
        initialState,
        mergeState: true
      });

      expect(initialState.mergeChildState).toHaveBeenCalled();
    });

    it('should not merge state when disabled', async () => {
      const initialState = {
        setCurrentFilePath: vi.fn(),
        addNode: vi.fn(),
        mergeChildState: vi.fn()
      };

      const nodes: MeldNode[] = [{
        type: 'text',
        content: 'Hello'
      }];

      await service.interpret(nodes, { 
        initialState,
        mergeState: false
      });

      expect(initialState.mergeChildState).not.toHaveBeenCalled();
    });
  });

  describe('Child context creation', () => {
    it('should create child context with parent state', async () => {
      const parentState = {
        createChildState: vi.fn().mockReturnValue(mockChildState)
      };

      await service.createChildContext(parentState);
      expect(parentState.createChildState).toHaveBeenCalled();
    });

    it('should set file path in child context when provided', async () => {
      const parentState = {
        createChildState: vi.fn().mockReturnValue(mockChildState)
      };

      await service.createChildContext(parentState, 'test.md');
      expect(mockChildState.setCurrentFilePath).toHaveBeenCalledWith('test.md');
    });
  });

  describe('Error handling', () => {
    it('should wrap non-interpreter errors', async () => {
      const node: MeldNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        },
        location: { start: { line: 1, column: 1 } }
      };

      mockDirectiveService.processDirective.mockRejectedValue(new Error('Test error'));

      const error = await service.interpretNode(node, mockStateService)
        .catch(e => e);

      expect(error).toBeInstanceOf(MeldInterpreterError);
      expect(error.location).toEqual(node.location?.start);
    });

    it('should preserve interpreter errors', async () => {
      const node: MeldNode = {
        type: 'directive',
        directive: {
          kind: 'text',
          name: 'greeting',
          value: 'Hello'
        },
        location: { start: { line: 1, column: 1 } }
      };

      const originalError = new MeldInterpreterError('Test error', 'directive', node.location?.start);
      mockDirectiveService.processDirective.mockRejectedValue(originalError);

      const error = await service.interpretNode(node, mockStateService)
        .catch(e => e);

      expect(error).toBe(originalError);
    });
  });
}); 