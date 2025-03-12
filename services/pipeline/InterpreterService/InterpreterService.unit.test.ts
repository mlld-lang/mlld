import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode } from 'meld-spec';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { DependencyContainer } from 'tsyringe';
import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import { IInterpreterService } from './IInterpreterService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.js';

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

describe('InterpreterService Unit', () => {
  let context: TestContextDI;
  let service: InterpreterService;
  let mockDirectiveService: any;
  let mockStateService: any;
  let mockChildState: any;

  beforeEach(async () => {
    // Create TestContextDI with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks
    mockDirectiveService = createMockDirectiveService();
    mockStateService = createMockStateService();
    mockChildState = mockStateService.createChildState();
    
    // Register mocks
    context.registerMock('DirectiveService', mockDirectiveService);
    context.registerMock('IDirectiveService', mockDirectiveService);
    context.registerMock('StateService', mockStateService);
    context.registerMock('IStateService', mockStateService);
    
    // Resolve the interpreter service
    service = await context.container.resolve(InterpreterService);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('initialization', () => {
    it('initializes with required services', () => {
      // Create a mock DirectiveServiceClientFactory that works with type checks
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue({
          supportsDirective: vi.fn().mockReturnValue(true),
          getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
          handleDirective: vi.fn().mockImplementation(async (node, context) => {
            return context.state;
          })
        }),
        // Add getDirectiveService to satisfy type checks
        getDirectiveService: vi.fn()
      } as unknown as InterpreterServiceClientFactory;
      
      // Pass the factory instead of the service directly
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      expect(service).toBeDefined();
      
      // Instead of checking directiveService, check if the client is initialized
      expect(service['directiveClientFactory']).toStrictEqual(mockDirectiveServiceClientFactory);
      expect(service['stateService']).toStrictEqual(mockStateService);
    });

    it('throws if initialized without required services', async () => {
      const uninitializedService = new InterpreterService();
      await expect(uninitializedService.interpret([])).rejects.toThrow(/InterpreterService must be initialized/);
    });
  });

  describe('node interpretation', () => {
    it('processes text nodes directly', async () => {
      // Create a mock DirectiveServiceClientFactory
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue({
          supportsDirective: vi.fn().mockReturnValue(true),
          getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
          handleDirective: vi.fn().mockImplementation(async (node, context) => {
            return context.state;
          })
        }),
        getDirectiveService: vi.fn()
      } as unknown as InterpreterServiceClientFactory;
      
      // Initialize the service with the mock factory
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      // Set up the test
      const textNode: TextNode = {
        type: 'Text',
        content: 'Sample text',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
      };
      
      // Execute
      await service.interpret([textNode]);
      
      // Verify state was updated correctly
      expect(mockStateService.addNode).toHaveBeenCalledWith(textNode);
    });

    it('delegates directive nodes to directive service', async () => {
      // Mock the directive client that will be returned by the factory
      const mockDirectiveClient = {
        supportsDirective: vi.fn().mockReturnValue(true),
        getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
        handleDirective: vi.fn().mockImplementation(async (node, context) => {
          return context.state;
        })
      };
      
      // Create the factory mock
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue(mockDirectiveClient),
        getDirectiveService: vi.fn()
      } as unknown as InterpreterServiceClientFactory;
      
      // Initialize with the factory
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      // Create directive node for testing
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: { kind: 'text', identifier: 'var', value: 'value' },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
      };
      
      // Execute
      await service.interpret([directiveNode]);
      
      // Verify the client's handleDirective was called
      expect(mockDirectiveClient.handleDirective).toHaveBeenCalled();
    });

    it('throws on unknown node types', async () => {
      // Create a mock DirectiveServiceClientFactory
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue({
          supportsDirective: vi.fn().mockReturnValue(true),
          getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
          handleDirective: vi.fn().mockImplementation(async (node, context) => {
            return context.state;
          })
        }),
        getDirectiveService: vi.fn()
      } as unknown as InterpreterServiceClientFactory;
      
      // Initialize the service
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      // Create an unknown node type for testing
      const unknownNode = {
        type: 'Unknown',
        content: 'unknown content'
      } as unknown as MeldNode;
      
      // Execute and verify it throws with the expected message
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
    it('wraps non-interpreter errors', async () => {
      // Create a mock DirectiveServiceClientFactory
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue({
          supportsDirective: vi.fn().mockReturnValue(true),
          getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
          handleDirective: vi.fn().mockImplementation(async (node, context) => {
            throw new Error('Generic error');
          })
        })
      } as unknown as InterpreterServiceClientFactory;
      
      // Initialize the service
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      // Create directive node for testing
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };
      
      // Execute and verify the error is wrapped
      await expect(service.interpret([directiveNode])).rejects.toBeInstanceOf(MeldInterpreterError);
    });

    it('preserves interpreter errors', async () => {
      // Create an error to be thrown
      const error = new MeldInterpreterError('Test error', 'test');
      
      // Create a mock DirectiveServiceClientFactory
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue({
          supportsDirective: vi.fn().mockReturnValue(true),
          getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
          handleDirective: vi.fn().mockImplementation(async (node, context) => {
            throw error;
          })
        })
      } as unknown as InterpreterServiceClientFactory;
      
      // Initialize the service
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      // Create directive node for testing
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };
      
      // Execute and verify the specific error instance is preserved
      try {
        await service.interpret([directiveNode]);
        fail('Should have thrown an error');
      } catch (e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        expect(e.message).toBe('Test error');
        expect(e.code).toBe('test');
      }
    });

    it('includes node location in errors', async () => {
      // Create a mock DirectiveServiceClientFactory
      const mockDirectiveServiceClientFactory = {
        createClient: vi.fn().mockReturnValue({
          supportsDirective: vi.fn().mockReturnValue(true),
          getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
          handleDirective: vi.fn().mockImplementation(async (node, context) => {
            throw new Error('Error with location');
          })
        })
      } as unknown as InterpreterServiceClientFactory;
      
      // Initialize the service
      const service = new InterpreterService(
        mockDirectiveServiceClientFactory,
        mockStateService
      );
      
      // Create directive node with specific location
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 42, column: 10 }, end: { line: 42, column: 30 } }
      };
      
      // Execute and verify location is included in error
      try {
        await service.interpret([directiveNode]);
        fail('Should have thrown an error');
      } catch (e) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        // The location should be extracted from the node
        expect(e.location).toMatchObject({
          line: 42,
          column: 10
        });
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
      const directiveNode: DirectiveNode = {
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
      const directiveNode: DirectiveNode = {
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
        } as DirectiveNode,
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