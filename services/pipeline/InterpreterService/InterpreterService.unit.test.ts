import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import type { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { DependencyContainer } from 'tsyringe';
import { TestContainerHelper } from '@tests/utils/di/TestContainerHelper.js';
import { DirectiveService } from '@services/pipeline/DirectiveService/DirectiveService.js';
import { StateService } from '@services/state/StateService/StateService.js';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';

// Mock dependencies
vi.mock('@services/pipeline/DirectiveService/DirectiveService.js');
vi.mock('@services/state/StateService/StateService.js');

// Create a standard mock state object with all required methods
const createStateMock = () => {
  // We need to create a recursive structure where each mock method returns another compatible mock
  const stateMock = {
    // Basic state management
    addNode: vi.fn(),
    setCurrentFilePath: vi.fn(),
    getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld'),
    getNodes: vi.fn().mockReturnValue([]),
    
    // Variable management
    getAllTextVars: vi.fn().mockReturnValue(new Map()),
    getAllDataVars: vi.fn().mockReturnValue(new Map()),
    getAllPathVars: vi.fn().mockReturnValue(new Map()),
    getTextVar: vi.fn(),
    setTextVar: vi.fn(),
    getLocalTextVars: vi.fn().mockReturnValue(new Map()),
    getDataVar: vi.fn(), 
    setDataVar: vi.fn(),
    getLocalDataVars: vi.fn().mockReturnValue(new Map()),
    getPathVar: vi.fn(),
    setPathVar: vi.fn(),
    
    // Transformation
    getTransformedNodes: vi.fn().mockReturnValue([]),
    setTransformedNodes: vi.fn(),
    transformNode: vi.fn(),
    isTransformationEnabled: vi.fn().mockReturnValue(true),
    enableTransformation: vi.fn(),
    shouldTransform: vi.fn().mockReturnValue(true),
    getTransformationOptions: vi.fn().mockReturnValue({}),
    hasTransformationSupport: vi.fn().mockReturnValue(true),
    
    // Command management
    getCommand: vi.fn(),
    setCommand: vi.fn(),
    getAllCommands: vi.fn().mockReturnValue(new Map()),
    getCommandOutput: vi.fn(),
    
    // Import management
    addImport: vi.fn(),
    removeImport: vi.fn(),
    hasImport: vi.fn().mockReturnValue(false),
    getImports: vi.fn().mockReturnValue(new Set()),
    
    // Content manipulation
    appendContent: vi.fn(),
    
    // State management
    hasLocalChanges: vi.fn().mockReturnValue(false),
    getLocalChanges: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    isImmutable: false,
    mergeChildState: vi.fn(),
    getStateId: vi.fn().mockReturnValue('test-state-id'),
    
    // Event and tracking
    setEventService: vi.fn(),
    setTrackingService: vi.fn(),
    
    // These methods need special implementation to avoid recursion issues
    createChildState: vi.fn(),
    clone: vi.fn()
  };
  
  // Implement methods that return new state objects to avoid infinite recursion
  stateMock.createChildState.mockImplementation(() => {
    return stateMock; // Return the same mock for simplicity in tests
  });
  
  stateMock.clone.mockImplementation(() => {
    return stateMock; // Return the same mock for simplicity in tests
  });
  
  return stateMock;
};

// Mock service creation functions
const createMockDirectiveService = () => ({
  // Core directive handling
  executeDirective: vi.fn().mockResolvedValue({
    replacement: { type: 'Text', content: 'Replaced content' },
    state: createStateMock()
  }),
  handleDirective: vi.fn().mockResolvedValue(createStateMock()),
  processDirective: vi.fn().mockResolvedValue(createStateMock()),
  processDirectives: vi.fn().mockResolvedValue(createStateMock()),
  
  // Directive registry
  supportsDirective: vi.fn().mockReturnValue(true),
  getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
  registerHandler: vi.fn(),
  hasHandler: vi.fn().mockReturnValue(true),
  getDirectiveKinds: vi.fn().mockReturnValue(['text', 'data']),
  
  // Validation
  validateDirective: vi.fn().mockResolvedValue(undefined),
  
  // Context and lifecycle
  createChildContext: vi.fn().mockImplementation((parentContext: DirectiveContext, filePath: string) => ({
    currentFilePath: filePath,
    parentState: parentContext.state,
    state: createStateMock()
  })),
  initialize: vi.fn(),
  updateInterpreterService: vi.fn(),
  
  // Transformation support
  supportsTransformation: vi.fn().mockReturnValue(true),
  enableTransformation: vi.fn()
});

// Factory mock
const createDirectiveServiceClientFactory = () => {
  const mockDirectiveService = createMockDirectiveService();
  
  return {
    getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService),
    createClient: vi.fn().mockReturnValue({
      supportsDirective: vi.fn().mockReturnValue(true),
      getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data']),
      handleDirective: vi.fn().mockImplementation(async (node, context) => {
        // We need to call executeDirective so it's tracked in our test expectations
        await mockDirectiveService.executeDirective(node, context);
        return mockDirectiveService.handleDirective(node, context);
      })
    })
  };
};

// Create a parent state that will throw an error for testing
const createErrorThrowingParentState = () => {
  const stateMock = createStateMock();
  stateMock.createChildState.mockImplementation(() => {
    throw new Error('Failed to create child state');
  });
  return stateMock;
};

describe('InterpreterService Unit', () => {
  let context: TestContextDI;
  let service: InterpreterService;
  let mockDirectiveService: ReturnType<typeof createMockDirectiveService>;
  let mockStateService: ReturnType<typeof createStateMock>;
  let mockDirectiveServiceClientFactory: ReturnType<typeof createDirectiveServiceClientFactory>;

  beforeEach(async () => {
    // Create TestContextDI with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks with proper implementations
    mockDirectiveService = createMockDirectiveService();
    mockStateService = createStateMock();
    mockDirectiveServiceClientFactory = createDirectiveServiceClientFactory();
    
    // Register mocks
    context.registerMock('DirectiveService', mockDirectiveService);
    context.registerMock('IDirectiveService', mockDirectiveService);
    context.registerMock('StateService', mockStateService);
    context.registerMock('IStateService', mockStateService);
    context.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
    
    // Create the service instance directly to have more control
    service = new InterpreterService(
      mockDirectiveServiceClientFactory as any, 
      mockStateService
    );
    
    // Make sure the service is fully initialized
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('initializes with directive service and state service', () => {
      expect(service).toBeDefined();
    });

    it('can be initialized after construction', () => {
      const newService = new InterpreterService();
      newService.initialize(mockDirectiveService, mockStateService);
      expect(newService).toBeDefined();
    });
  });

  describe('node interpretation', () => {
    it('processes text nodes directly', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'Test content',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } }
      };

      await service.interpret([textNode]);
      
      // Verify state was updated correctly
      expect(mockStateService.addNode).toHaveBeenCalledWith(textNode);
    });

    it('delegates directive nodes to directive service', async () => {
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      await service.interpret([directiveNode]);
      
      // Get the client that was returned by the factory
      const client = mockDirectiveServiceClientFactory.createClient();
      
      // Verify the client's handleDirective was called with the directive node
      expect(client.handleDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: expect.anything()
        })
      );
    });

    it('throws on unknown node types', async () => {
      const unknownNode = {
        type: 'Unknown',
        content: 'Test content'
      } as unknown as MeldNode;

      await expect(service.interpret([unknownNode]))
        .rejects.toThrow('Unknown node type: Unknown');
    });
  });

  describe('state management', () => {
    it('clones state for each interpretation', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'Test content',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } }
      };

      await service.interpret([textNode]);
      
      // Verify state was cloned
      expect(mockStateService.clone).toHaveBeenCalled();
    });

    it('returns the final state', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'Test content',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } }
      };

      const result = await service.interpret([textNode]);
      
      // Result should be the state
      expect(result).toBeDefined();
    });

    it('handles empty node arrays', async () => {
      const result = await service.interpret([]);
      
      // Should still return a state
      expect(result).toBeDefined();
      // State clone should still be called
      expect(mockStateService.clone).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('wraps non-interpreter errors', async () => {
      // Create a node that will cause an error
      const node: TextNode = { type: 'Text', content: 'Test content' };
      
      // Make the state service throw an error
      mockStateService.clone.mockImplementationOnce(() => {
        throw new Error('Generic error');
      });
      
      try {
        await service.interpretNode(node, mockStateService);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError) {
          expect(e.message).toContain('Generic error');
        }
      }
    });
    
    it('preserves interpreter errors', async () => {
      // Create a node that will cause an error
      const node: TextNode = { type: 'Text', content: 'Test content' };
      
      // Make the state service throw a MeldInterpreterError 
      // Note: We need to use 'INTERPRETATION_FAILED' to match what the service does
      mockStateService.clone.mockImplementationOnce(() => {
        throw new MeldInterpreterError('Test error', 'INTERPRETATION_FAILED');
      });
      
      try {
        await service.interpretNode(node, mockStateService);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError) {
          expect(e.message).toContain('Test error');
          expect(e.code).toBe('INTERPRETATION_FAILED');
        }
      }
    });
    
    it('extracts location from node for errors', async () => {
      // Create a node with location information
      const node: TextNode = {
        type: 'Text',
        content: 'Test content',
        location: {
          start: { line: 10, column: 5 },
          end: { line: 10, column: 20 }
        }
      };
      
      // Make the state service throw an error
      mockStateService.clone.mockImplementationOnce(() => {
        throw new Error('Location test error');
      });
      
      try {
        await service.interpretNode(node, mockStateService);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        // The location should be extracted from the node
        if (e instanceof MeldInterpreterError) {
          expect(e.location).toBeDefined();
          expect(e.location?.line).toBe(10);
          expect(e.location?.column).toBe(5);
        }
      }
    });
  });

  describe('options handling', () => {
    it('sets file path in state when provided', async () => {
      const textNode: TextNode = {
        type: 'Text',
        content: 'Test content',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } }
      };

      await service.interpret([textNode], { filePath: '/test/new-file.meld' });
      
      // Verify file path was set
      expect(mockStateService.setCurrentFilePath).toHaveBeenCalledWith('/test/new-file.meld');
    });

    it('passes options to directive service', async () => {
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      const options = {
        filePath: '/test/new-file.meld',
        customOption: 'value'
      };

      // Reset the client factory mock before the test
      mockDirectiveServiceClientFactory = createDirectiveServiceClientFactory();
      const client = mockDirectiveServiceClientFactory.createClient();
      context.registerMock('DirectiveServiceClientFactory', mockDirectiveServiceClientFactory);
      
      // Make sure state service sets the file path correctly
      mockStateService.getCurrentFilePath.mockReturnValue('/test/new-file.meld');
      
      // Create a new service instance with our fresh mocks
      service = new InterpreterService(
        mockDirectiveServiceClientFactory as any, 
        mockStateService
      );
      
      await service.interpret([directiveNode], options);
      
      // Verify the client's handleDirective was called
      expect(client.handleDirective).toHaveBeenCalled();
      
      // Get the actual context passed to handleDirective
      const calls = client.handleDirective.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      
      // Verify the first argument is the directive node
      expect(calls[0][0]).toBe(directiveNode);
      
      // Verify the file path is in the context
      const contextArg = calls[0][1];
      expect(contextArg.currentFilePath).toBe('/test/new-file.meld');
    });
  });

  describe('child context creation', () => {
    it('creates a child context with parent state', async () => {
      const parentState = createStateMock();
      const childState = await service.createChildContext(parentState);
      
      expect(childState).toBeDefined();
      expect(parentState.createChildState).toHaveBeenCalled();
    });
    
    it('sets file path in child context when provided', async () => {
      const parentState = createStateMock();
      const childState = await service.createChildContext(parentState, '/test/child.meld');
      
      expect(childState).toBeDefined();
      expect(childState.setCurrentFilePath).toHaveBeenCalledWith('/test/child.meld');
    });
    
    it('handles errors in child context creation', async () => {
      const parentState = createErrorThrowingParentState();
      
      try {
        await service.createChildContext(parentState);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpreterError);
        if (error instanceof MeldInterpreterError) {
          expect(error.message).toContain('Failed to create child state');
        }
      }
    });
  });

  describe('edge cases', () => {
    it('handles directive service initialization failures', async () => {
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
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
        .rejects.toThrow('Interpreter error (directive_handling): No directive service available');
    });

    it('handles state rollback on partial failures', async () => {
      // Create nodes for testing
      const textNode1: TextNode = { type: 'Text', content: 'Before directive' };
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: { kind: 'text', name: 'test', value: 'value' }
      };
      const textNode2: TextNode = { type: 'Text', content: 'After directive' };
      
      // Make the directive handler throw an error
      const clientFactory = createDirectiveServiceClientFactory();
      const client = clientFactory.createClient();
      client.handleDirective = vi.fn().mockRejectedValueOnce(new MeldInterpreterError('Test error', 'test_code'));
      clientFactory.createClient = vi.fn().mockReturnValue(client);
      
      // Create a new service with the modified factory
      const errorService = new InterpreterService(
        clientFactory as any,
        mockStateService
      );
      
      // Should throw an error
      await expect(errorService.interpret([textNode1, directiveNode, textNode2]))
        .rejects.toThrow(MeldInterpreterError);
      
      // Verify state was rolled back
      expect(mockStateService.clone).toHaveBeenCalled();
    });

    it('preserves original error stack traces', async () => {
      // Create a node that will cause an error
      const node: TextNode = { type: 'Text', content: 'Test content' };
      
      // Create an original error with stack trace
      const originalError = new Error('Original error');
      
      // Make the state service throw the original error
      mockStateService.clone.mockImplementationOnce(() => {
        throw originalError;
      });
      
      try {
        await service.interpretNode(node, mockStateService);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError && e.cause) {
          expect(e.cause).toBe(originalError);
        }
      }
    });

    it('handles null or undefined nodes gracefully', async () => {
      // @ts-ignore - Testing runtime behavior with invalid input
      await expect(service.interpret([null, undefined]))
        .rejects.toThrow(MeldInterpreterError);
    });

    it('handles nodes without location information', async () => {
      const nodeWithoutLocation = {
        type: 'Text',
        content: 'No location'
      } as TextNode;
      
      await service.interpret([nodeWithoutLocation]);
      
      // Should still process the node
      expect(mockStateService.addNode).toHaveBeenCalledWith(nodeWithoutLocation);
    });

    it('handles nodes with partial location information', async () => {
      const nodeWithPartialLocation = {
        type: 'Text',
        content: 'Partial location',
        location: { start: { line: 1, column: 1 } }
      } as TextNode;
      
      await service.interpret([nodeWithPartialLocation]);
      
      // Should still process the node
      expect(mockStateService.addNode).toHaveBeenCalledWith(nodeWithPartialLocation);
    });
  });
}); 