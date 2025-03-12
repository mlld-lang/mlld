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
import { DirectiveServiceClientFactory } from './factories/DirectiveServiceClientFactory.js';

// Mock dependencies
vi.mock('@services/pipeline/DirectiveService/DirectiveService.js');
vi.mock('@services/state/StateService/StateService.js');

// Mock service creation functions
const createMockDirectiveService = () => ({
  executeDirective: vi.fn().mockResolvedValue({
    state: {},
    replacement: { type: 'Text', content: 'Replaced content' }
  }),
  supportsDirective: vi.fn().mockReturnValue(true),
  getSupportedDirectives: vi.fn().mockReturnValue(['text', 'data'])
});

// Create a more complete mock state object structure with all required methods
const createBaseMockState = () => ({
  addNode: vi.fn(),
  setCurrentFilePath: vi.fn(),
  getCurrentFilePath: vi.fn().mockReturnValue('/test/file.meld'),
  getAllTextVars: vi.fn().mockReturnValue({}),
  getAllDataVars: vi.fn().mockReturnValue({}),
  getAllPathVars: vi.fn().mockReturnValue({}),
  getNodes: vi.fn().mockReturnValue([]),
  clone: vi.fn(),
  createChildState: vi.fn()
});

// Create a shared mock state object structure to ensure consistency
const createMockStateObject = () => {
  // Create a base object with all the needed methods
  const stateObj = createBaseMockState();
  
  // Instead of recursively calling createMockStateObject, just return a simple mock
  // that has the same API but doesn't cause infinite recursion
  stateObj.clone.mockImplementation(() => {
    return createBaseMockState();
  });
  
  // Child state creation should also return a properly mocked state
  stateObj.createChildState.mockImplementation(() => {
    return createBaseMockState();
  });
  
  return stateObj;
};

const createMockStateService = () => {
  // Create a properly mocked state service
  return createMockStateObject();
};

describe('InterpreterService Unit', () => {
  let context: TestContextDI;
  let service: InterpreterService;
  let mockDirectiveService: ReturnType<typeof createMockDirectiveService>;
  let mockStateService: ReturnType<typeof createMockStateService>;
  let mockDirectiveServiceClientFactory: DirectiveServiceClientFactory;

  beforeEach(async () => {
    // Create TestContextDI with isolated container
    context = TestContextDI.createIsolated();
    await context.initialize();
    
    // Create mocks
    mockDirectiveService = createMockDirectiveService();
    mockStateService = createMockStateService();
    
    // Register mocks
    context.registerMock('DirectiveService', mockDirectiveService);
    context.registerMock('IDirectiveService', mockDirectiveService);
    context.registerMock('StateService', mockStateService);
    context.registerMock('IStateService', mockStateService);
    
    // Create a mock factory that returns the directive service
    mockDirectiveServiceClientFactory = {
      getDirectiveService: vi.fn().mockReturnValue(mockDirectiveService)
    } as unknown as DirectiveServiceClientFactory;
    
    // Resolve the interpreter service
    service = await context.container.resolve(InterpreterService);
  });

  afterEach(async () => {
    await context?.cleanup();
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
      
      // Verify directive service was called
      expect(mockDirectiveService.executeDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          state: mockStateService
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
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      // Mock directive service to throw a generic error
      mockDirectiveService.executeDirective.mockImplementation(() => {
        throw new Error('Generic error');
      });

      try {
        await service.interpret([directiveNode]);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError) {
          expect(e.message).toContain('Generic error');
          expect(e.code).toBe('directive_handling');
        }
      }
    });

    it('preserves interpreter errors', async () => {
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };

      // Mock directive service to throw an interpreter error
      mockDirectiveService.executeDirective.mockImplementation(() => {
        throw new MeldInterpreterError('Test error', 'test');
      });

      try {
        await service.interpret([directiveNode]);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        if (e instanceof MeldInterpreterError) {
          expect(e.message).toContain('Test error');
          expect(e.code).toBe('test');
        }
      }
    });

    it('extracts location from node for errors', async () => {
      const node: TextNode = {
        type: 'Text',
        content: 'test',
        location: {
          start: { line: 42, column: 10 },
          end: { line: 42, column: 14 }
        }
      };

      // Mock directive service to throw an error
      mockDirectiveService.executeDirective.mockImplementation(() => {
        throw new Error('Test error');
      });

      try {
        await service.interpret([node]);
        expect.fail('Should have thrown an error');
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(MeldInterpreterError);
        // The location should be extracted from the node
        if (e instanceof MeldInterpreterError) {
          expect(e.location).toMatchObject({
            severity: 'fatal'
          });
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

      await service.interpret([directiveNode], options);
      
      // Verify options were passed to directive service
      expect(mockDirectiveService.executeDirective).toHaveBeenCalledWith(
        directiveNode,
        expect.objectContaining({
          currentFilePath: '/test/new-file.meld',
          customOption: 'value'
        })
      );
    });
  });

  describe('child context creation', () => {
    it('creates a child context with parent state', async () => {
      const parentState = { id: 'parent' };
      const childState = { id: 'child' };
      
      // Mock state service to return a specific clone
      mockStateService.clone.mockReturnValue(childState);
      
      const result = await service.createChildContext(parentState as any);
      
      // Should return the child state
      expect(result).toBe(childState);
    });

    it('sets file path in child context when provided', async () => {
      const parentState = { 
        clone: vi.fn().mockReturnValue({
          setCurrentFilePath: vi.fn()
        })
      };
      
      await service.createChildContext(parentState as any, '/test/child-file.meld');
      
      // Verify file path was set in child state
      expect(parentState.clone().setCurrentFilePath).toHaveBeenCalledWith('/test/child-file.meld');
    });

    it('handles errors in child context creation', async () => {
      const parentState = { 
        clone: vi.fn().mockImplementation(() => {
          throw new Error('Clone error');
        })
      };
      
      await expect(service.createChildContext(parentState as any))
        .rejects.toThrow(MeldInterpreterError);
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
      const textNode1: TextNode = {
        type: 'Text',
        content: 'First node',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
      };
      
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 30 } }
      };
      
      const textNode2: TextNode = {
        type: 'Text',
        content: 'Third node',
        location: { start: { line: 3, column: 1 }, end: { line: 3, column: 10 } }
      };
      
      // Mock directive service to throw an error on the second node
      mockDirectiveService.executeDirective.mockImplementation(() => {
        throw new Error('Directive error');
      });
      
      // Should throw an error
      await expect(service.interpret([textNode1, directiveNode, textNode2]))
        .rejects.toThrow(MeldInterpreterError);
      
      // First node should have been processed
      expect(mockStateService.addNode).toHaveBeenCalledWith(textNode1);
      
      // Third node should not have been processed
      expect(mockStateService.addNode).not.toHaveBeenCalledWith(textNode2);
    });

    it('preserves original error stack traces', async () => {
      const directiveNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          name: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } }
      };
      
      // Create an error with a stack trace
      const originalError = new Error('Original error');
      
      // Mock directive service to throw the error
      mockDirectiveService.executeDirective.mockImplementation(() => {
        throw originalError;
      });
      
      try {
        await service.interpret([directiveNode]);
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