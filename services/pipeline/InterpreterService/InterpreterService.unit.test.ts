import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { InterpreterService } from './InterpreterService.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldNode, DirectiveNode as MeldDirective, TextNode, SourceLocation } from 'meld-spec';
import { IInterpreterService } from './IInterpreterService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { createService } from '@core/ServiceProvider.js';
import { container } from 'tsyringe';
import { DependencyContainer } from 'tsyringe';
import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper.js';

// Mock dependencies
vi.mock('@services/pipeline/DirectiveService/DirectiveService.js');
vi.mock('@services/state/StateService/StateService.js');

// Mock service creation functions
const createMockDirectiveService = () => {
  // Create mock child state with immutable state support
  const mockChildState = {
    setCurrentFilePath: vi.fn(),
    getCurrentFilePath: vi.fn(),
    addNode: vi.fn(),
    mergeChildState: vi.fn(),
    clone: vi.fn().mockReturnThis(),
    getTextVar: vi.fn(),
    getDataVar: vi.fn(),
    getNodes: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    setTextVar: vi.fn(),
    createChildState: vi.fn().mockReturnThis(),
    variables: {
      text: new Map(),
      data: new Map(),
      path: new Map()
    },
    commands: new Map(),
    imports: new Set(),
    nodes: [],
    filePath: undefined,
    parentState: undefined
  } as unknown as Mocked<StateService>;

  return {
    initialize: vi.fn(),
    processDirective: vi.fn().mockResolvedValue(mockChildState),
    handleDirective: vi.fn(),
    validateDirective: vi.fn(),
    createChildContext: vi.fn(),
    processDirectives: vi.fn(),
    supportsDirective: vi.fn(),
    getSupportedDirectives: vi.fn(),
    updateInterpreterService: vi.fn(),
    registerHandler: vi.fn(),
    hasHandler: vi.fn()
  } as unknown as Mocked<DirectiveService>;
};

const createMockStateService = () => {
  const mockChildState = {
    setCurrentFilePath: vi.fn(),
    getCurrentFilePath: vi.fn(),
    addNode: vi.fn(),
    mergeChildState: vi.fn(),
    clone: vi.fn().mockReturnThis(),
    getTextVar: vi.fn(),
    getDataVar: vi.fn(),
    getNodes: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    setTextVar: vi.fn(),
    createChildState: vi.fn().mockReturnThis(),
    variables: {
      text: new Map(),
      data: new Map(),
      path: new Map()
    },
    commands: new Map(),
    imports: new Set(),
    nodes: [],
    filePath: undefined,
    parentState: undefined
  } as unknown as Mocked<StateService>;

  return {
    createChildState: vi.fn().mockReturnValue(mockChildState),
    addNode: vi.fn(),
    mergeStates: vi.fn(),
    setCurrentFilePath: vi.fn(),
    getCurrentFilePath: vi.fn(),
    getTextVar: vi.fn(),
    getDataVar: vi.fn(),
    getNodes: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    setTextVar: vi.fn(),
    clone: vi.fn().mockReturnThis(),
    mergeChildState: vi.fn(),
    variables: {
      text: new Map(),
      data: new Map(),
      path: new Map()
    },
    commands: new Map(),
    imports: new Set(),
    nodes: [],
    filePath: undefined,
    parentState: undefined
  } as unknown as Mocked<StateService>;
};

describe.each([
  { useDI: true, name: 'with DI' },
  { useDI: false, name: 'without DI' },
])('InterpreterService Unit > %s', ({ useDI, name }) => {
  let context: TestContextDI;
  let service: InterpreterService;
  let mockDirectiveService: any;
  let mockStateService: any;
  let mockChildState: any;

  beforeEach(async () => {
    // Create mock child state
    mockChildState = {
      setCurrentFilePath: vi.fn(),
      getCurrentFilePath: vi.fn(),
      addNode: vi.fn(),
      mergeChildState: vi.fn(),
      clone: vi.fn().mockReturnThis(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      getNodes: vi.fn().mockReturnValue([]),
      setImmutable: vi.fn(),
      setTextVar: vi.fn(),
      createChildState: vi.fn().mockReturnThis(),
      variables: {
        text: new Map(),
        data: new Map(),
        path: new Map()
      },
      commands: new Map(),
      imports: new Set(),
      nodes: [],
      filePath: undefined,
      parentState: undefined
    };
    
    // Create mock services
    mockDirectiveService = createMockDirectiveService();
    mockStateService = createMockStateService();
    
    // Update mockStateService to return our mockChildState
    mockStateService.createChildState = vi.fn().mockReturnValue(mockChildState);
    mockDirectiveService.processDirective = vi.fn().mockResolvedValue(mockChildState);
    
    // Create test context with DI (which is now always used)
    context = TestContextDI.create({ isolatedContainer: true });

    // Register our mocks in the context
    context.registerMock('IDirectiveService', mockDirectiveService);
    context.registerMock('IStateService', mockStateService);
    
    // Use the container to resolve the service
    service = context.resolveSync(InterpreterService);
    
    // Give the service a moment to initialize via setTimeout
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('initialization', () => {
    it('initializes with required services', (): void => {
      expect(service).toBeDefined();
      // Access to private properties should still work in tests
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
      const textNode: TextNode = {
        type: 'Text',
        content: 'Hello world',
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 12 }
        }
      } as TextNode;

      await service.interpret([textNode]);
      expect(mockChildState.addNode).toHaveBeenCalledWith(textNode);
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

      mockChildState.getCurrentFilePath.mockReturnValue('test.meld');
      await service.interpret([directiveNode]);
      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: expect.any(Object),
          currentFilePath: 'test.meld'
        })
      );

      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('text');
    });

    it('throws on unknown node types', async (): Promise<void> => {
      const unknownNode = {
        type: 'Unknown',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      } as unknown as MeldNode;

      await expect(service.interpret([unknownNode])).rejects.toThrow(/unknown node type/i);
    });
  });

  describe('state management', () => {
    it('creates new state for each interpretation', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      await service.interpret(nodes);
      expect(mockStateService.createChildState).toHaveBeenCalled();
    });

    it('uses provided initial state when specified', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      const initialState = mockStateService;
      await service.interpret(nodes, { initialState });
      expect(mockStateService.createChildState).toHaveBeenCalled();
    });

    it('merges state when specified', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      const initialState = mockStateService;
      await service.interpret(nodes, {
        initialState,
        mergeState: true
      });
      expect(mockStateService.mergeChildState).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('wraps non-interpreter errors', async (): Promise<void> => {
      const error = new Error('Test error');
      mockDirectiveService.processDirective.mockRejectedValue(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await expect(service.interpret([directiveNode])).rejects.toBeInstanceOf(MeldInterpreterError);
    });

    it('preserves interpreter errors', async (): Promise<void> => {
      const error = new MeldInterpreterError('Test error', 'test');
      mockDirectiveService.processDirective.mockRejectedValue(error);

      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await expect(service.interpret([directiveNode])).rejects.toEqual(error);
    });

    it('includes node location in errors', async (): Promise<void> => {
      const error = new Error('Test error');
      mockDirectiveService.processDirective.mockRejectedValue(error);

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
        expect.fail('Should have thrown error');
      } catch (e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError && directiveNode.location) {
          expect(e.location).toEqual({
            line: directiveNode.location.start.line,
            column: directiveNode.location.start.column
          });
        }
      }
    });
  });

  describe('options handling', () => {
    it('sets file path in state when provided', async (): Promise<void> => {
      const nodes: MeldNode[] = [];
      await service.interpret(nodes, {
        filePath: 'test.meld'
      });
      expect(mockChildState.setCurrentFilePath).toHaveBeenCalledWith('test.meld');
    });

    it('passes options to directive service', async (): Promise<void> => {
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
        filePath: 'test.meld'
      };

      mockChildState.getCurrentFilePath.mockReturnValue('test.meld');
      await service.interpret([directiveNode], options);
      expect(mockDirectiveService.processDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: expect.any(Object),
          currentFilePath: 'test.meld'
        })
      );
    });
  });

  describe('child context creation', () => {
    it('creates child context with parent state', async () => {
      const parentState = mockStateService;
      const childState = await service.createChildContext(parentState);
      expect(mockStateService.createChildState).toHaveBeenCalled();
      expect(childState).toBeDefined();
    });

    it('sets file path in child context when provided', async () => {
      const parentState = mockStateService;
      const filePath = 'test.meld';
      const childState = await service.createChildContext(parentState, filePath);
      expect(mockChildState.setCurrentFilePath).toHaveBeenCalledWith(filePath);
    });

    it('handles errors in child context creation', async () => {
      const error = new Error('Test error');
      mockStateService.createChildState.mockImplementation(() => {
        throw error;
      });

      await expect(service.createChildContext(mockStateService))
        .rejects.toBeInstanceOf(MeldInterpreterError);
    });
  });

  describe('edge cases', () => {
    it('handles empty node arrays', async () => {
      const result = await service.interpret([]);
      expect(result).toBeDefined();
      expect(result.getNodes()).toHaveLength(0);
    });

    it('handles null/undefined nodes', async () => {
      await expect(service.interpret(null as unknown as MeldNode[]))
        .rejects.toThrow('No nodes provided for interpretation');
    });

    it('handles state initialization failures', async () => {
      mockStateService.createChildState.mockReturnValue(null as unknown as StateService);
      await expect(service.interpret([]))
        .rejects.toThrow('Failed to initialize state for interpretation');
    });

    it('handles directive service initialization failures', async () => {
      const directiveNode: MeldDirective = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      // Initialize a new service with broken configuration for this test only
      const brokenService = new InterpreterService();
      brokenService.initialize(mockDirectiveService, mockStateService);
      // Force directiveService to be undefined to simulate initialization failure
      brokenService['directiveService'] = undefined;

      await expect(brokenService.interpret([directiveNode]))
        .rejects.toThrow('InterpreterService must be initialized before use');
    });

    it('preserves node order in state', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'first',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 6 }
          }
        } as TextNode,
        {
          type: 'Text',
          content: 'second',
          location: {
            start: { line: 2, column: 1 },
            end: { line: 2, column: 7 }
          }
        } as TextNode
      ];

      mockChildState.getNodes.mockReturnValue(nodes);
      const result = await service.interpret(nodes);
      const resultNodes = result.getNodes();
      expect(resultNodes).toHaveLength(2);
      expect(resultNodes[0].type).toBe('Text');
      expect((resultNodes[0] as TextNode).content).toBe('first');
      expect(resultNodes[1].type).toBe('Text');
      expect((resultNodes[1] as TextNode).content).toBe('second');
    });

    it('handles state rollback on partial failures', async () => {
      const nodes: MeldNode[] = [
        {
          type: 'Text',
          content: 'first',
          location: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: 6 }
          }
        } as TextNode,
        {
          type: 'Directive',
          directive: {
            kind: 'text',
            identifier: 'test',
            value: 'value'
          },
          location: { start: { line: 2, column: 1 }, end: { line: 2, column: 30 } }
        } as MeldDirective,
        {
          type: 'Text',
          content: 'third',
          location: {
            start: { line: 3, column: 1 },
            end: { line: 3, column: 6 }
          }
        } as TextNode
      ];

      mockDirectiveService.processDirective.mockRejectedValue(new Error('Test error'));

      try {
        await service.interpret(nodes);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        const state = mockStateService.createChildState();
        expect(state.getNodes()).toHaveLength(0);
      }
    });
  });
}); 