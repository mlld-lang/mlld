import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import type { StateNode, IStateFactory } from '@services/state/StateService/types.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { TransformationOptions } from '@core/types/state.js';
import { createTextVariable } from '@core/types';

// Define the default options locally for the test file
const DEFAULT_TRANSFORMATION_OPTIONS_TEST: TransformationOptions = {
  enabled: false,
  preserveOriginal: true,
  transformNested: true,
};

// Helper to create a mock IStateService for testing parent references
const createMockParentService = (stateNode?: StateNode): IStateService => ({
  getTransformationOptions: vi.fn(() => stateNode?.transformationOptions ?? DEFAULT_TRANSFORMATION_OPTIONS_TEST),
  getInternalStateNode: vi.fn(() => stateNode),
  getStateId: vi.fn(() => stateNode?.stateId),
  // Add other methods as needed by tests, mocking their return values
  getVariable: vi.fn(), 
  setVariable: vi.fn().mockResolvedValue(undefined), // Ensure promise resolution
  hasVariable: vi.fn(),
  removeVariable: vi.fn().mockResolvedValue(false), // Ensure promise resolution
  getNodes: vi.fn(() => stateNode?.nodes ?? []),
  addNode: vi.fn(),
  appendContent: vi.fn(),
  getTransformedNodes: vi.fn(() => stateNode?.transformedNodes ?? stateNode?.nodes ?? []),
  setTransformedNodes: vi.fn(),
  transformNode: vi.fn(),
  isTransformationEnabled: vi.fn(() => stateNode?.transformationOptions?.enabled ?? false),
  setTransformationEnabled: vi.fn(),
  setTransformationOptions: vi.fn(),
  addImport: vi.fn(),
  removeImport: vi.fn(),
  hasImport: vi.fn(() => false),
  getImports: vi.fn(() => stateNode?.imports ?? new Set()),
  getCurrentFilePath: vi.fn(() => stateNode?.filePath ?? null),
  setCurrentFilePath: vi.fn(),
  hasLocalChanges: vi.fn(() => true),
  getLocalChanges: vi.fn(() => ['state']),
  setImmutable: vi.fn(),
  isImmutable: false,
  createChildState: vi.fn(),
  mergeChildState: vi.fn(),
  clone: vi.fn(),
  getParentState: vi.fn(),
  getCommandOutput: vi.fn(),
  hasTransformationSupport: vi.fn(() => true),
  shouldTransform: vi.fn(() => false), // Default to false unless overridden
  setEventService: vi.fn(), // Added missing methods from IStateService
  setTrackingService: vi.fn(), // Added missing methods from IStateService
});

describe('StateFactory', () => {
  const helpers = TestContextDI.createTestHelpers(); // Define helpers
  let factory: IStateFactory;
  let context: TestContextDI;

  beforeEach(async () => {
    // Use setupMinimal helper, which provides basic DI without extensive mocks
    context = helpers.setupMinimal(); 
    // Initialization is handled within setupMinimal if needed
    
    // Get service instance using DI (expecting the real factory)
    factory = await context.resolve<IStateFactory>('IStateFactory');
    
    // Add a check to ensure we got the real factory
    expect(factory).toBeInstanceOf(StateFactory);
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('createState', () => {
    it('should create an empty state', () => {
      const state = factory.createState();
      
      expect(state.variables.text.size).toBe(0);
      expect(state.variables.data.size).toBe(0);
      expect(state.variables.path.size).toBe(0);
      expect(state.imports.size).toBe(0);
      expect(state.nodes.length).toBe(0);
      expect(state.filePath).toBeUndefined();
      expect(state.parentServiceRef).toBeUndefined();
      expect(state.transformationOptions).toEqual(DEFAULT_TRANSFORMATION_OPTIONS_TEST); // Use local const
      expect(state.createdAt).toBeTypeOf('number');
      expect(state.modifiedAt).toBeTypeOf('number');
    });

    it('should create state with options', () => {
      const mockParentNode = factory.createState(); // Create a node to be wrapped
      const mockParentService = createMockParentService(mockParentNode);

      const state = factory.createState({
        parentServiceRef: mockParentService,
        filePath: '/test/file.md',
        source: 'test'
      });

      expect(state.parentServiceRef).toBe(mockParentService);
      expect(state.filePath).toBe('/test/file.md');
      expect(state.transformationOptions).toEqual(mockParentService.getTransformationOptions());
    });

    // This test is no longer valid as createState does not handle inheritance directly.
    // Inheritance is handled by StateService.getVariable looking up the parent chain.
    it.skip('should inherit parent state', () => { 
      // Create parent with some state
      const parentBase = factory.createState();
      // Use createTextVariable for type safety
      const parentTextVar = createTextVariable('inherited', 'value', {}); 
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['inherited', parentTextVar]]),
          data: new Map([['config', { value: { inherited: true } } as any]]), // Adjust if DataVariable type is stricter
          path: new Map([['root', { value: '/parent' } as any]]) // Adjust if PathVariable type is stricter
        },
        imports: new Set(['parent.md']),
        nodes: [{ type: 'Text', content: 'parent', location: {} as any, nodeId: 'test-node-1' } as any] // Use correct TextNode structure
      });
      const mockParentService = createMockParentService(parent);

      // Create child state using parentServiceRef
      const child = factory.createState({ parentServiceRef: mockParentService });

      // Verify **NO** direct inheritance in the created node itself
      expect(child.variables.text.size).toBe(0); 
      expect(child.variables.data.size).toBe(0);
      expect(child.variables.path.size).toBe(0);
      expect(child.imports.size).toBe(0);
      expect(child.nodes.length).toBe(0);
      
      // Assertions below are removed/skipped because createState doesn't inherit variables directly anymore.
      // expect(child.variables.text.get('inherited')).toBe('value');
      // expect(child.variables.data.get('config')).toEqual({ inherited: true });
      // expect(child.variables.path.get('root')).toBe('/parent');
      // expect(child.imports.has('parent.md')).toBe(true);
      // expect(child.nodes[0].value).toBe('parent');
    });
  });

  describe('createChildState', () => {
    it('should create child state with parent reference', () => {
      const parentNode = factory.createState();
      const mockParentService = createMockParentService(parentNode);
      const child = factory.createChildState(mockParentService); // Pass mock IStateService instance

      expect(child.parentServiceRef).toBe(mockParentService);
      expect(mockParentService.getTransformationOptions).toHaveBeenCalled();
    });

    // This test might need adjustment. createChildState only sets up the parent link.
    // Variable inheritance happens when StateService.getVariable is called.
    it.skip('should create child state that **links** to parent (inheritance tested in StateService)', () => {
      // Create parent state node with some values
      const parentBase = factory.createState();
      const parentNode = factory.updateState(parentBase, {
        variables: {
          text: new Map([['text', createTextVariable('text', 'parent', {})]]),
          data: new Map([['data', { value: { value: 'parent' } } as any]]),
          path: new Map([['path', { value: '/parent' } as any]])
        }
      });
      const mockParentService = createMockParentService(parentNode);

      // Create child state linked to the mock parent service
      const childNode = factory.createChildState(mockParentService); // Pass mock IStateService instance

      // Verify child node itself is empty
      expect(childNode.variables.text.size).toBe(0); 
      expect(childNode.variables.data.size).toBe(0);
      expect(childNode.variables.path.size).toBe(0);
      expect(childNode.parentServiceRef).toBe(mockParentService);
      
      // Assertions checking direct variable presence in the child node are removed.
      // expect(child.variables.text.get('text')).toBe('parent');
      // expect(child.variables.data.get('data')).toEqual({ value: 'parent' });
      // expect(child.variables.path.get('path')).toBe('/parent');
    });
  });

  describe('mergeStates', () => {
    // ... mergeStates tests seem okay, but ensure they use valid StateNode structures ...
    it('should merge variables from child to parent', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['parentText', createTextVariable('parentText', 'parent', {})]]),
          data: new Map([['parentData', { value: { value: 'parent' } } as any]]),
          path: new Map([['parentPath', { value: '/parent' } as any]])
        }
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        variables: {
          text: new Map([['childText', createTextVariable('childText', 'child', {})]]),
          data: new Map([['childData', { value: { value: 'child' } } as any]]),
          path: new Map([['childPath', { value: '/child' } as any]])
        }
      });

      const merged = factory.mergeStates(parent, child);

      // Check merged variables (access .value for Variable types)
      expect(merged.variables.text.get('parentText')?.value).toBe('parent');
      expect(merged.variables.text.get('childText')?.value).toBe('child');
      expect(merged.variables.data.get('parentData')?.value).toEqual({ value: 'parent' });
      expect(merged.variables.data.get('childData')?.value).toEqual({ value: 'child' });
      expect(merged.variables.path.get('parentPath')?.value).toBe('/parent');
      expect(merged.variables.path.get('childPath')?.value).toBe('/child');
    });

    it('should override parent variables with child values', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['text', createTextVariable('text', 'parent', {})]])
        }
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        variables: {
          text: new Map([['text', createTextVariable('text', 'child', {})]])
        }
      });

      const merged = factory.mergeStates(parent, child);

      expect(merged.variables.text.get('text')?.value).toBe('child');
      // Verify parent state wasn't modified
      expect(parent.variables.text.get('text')?.value).toBe('parent');
    });

    it('should merge imports and nodes', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        imports: new Set(['parent.md']),
        nodes: [{ type: 'Text', content: 'parent', location: {} as any, nodeId: 'test-node-p' } as any]
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        imports: new Set(['child.md']),
        nodes: [{ type: 'Text', content: 'child', location: {} as any, nodeId: 'test-node-c' } as any]
      });

      const merged = factory.mergeStates(parent, child);

      expect(merged.imports.has('parent.md')).toBe(true);
      expect(merged.imports.has('child.md')).toBe(true);
      expect(merged.nodes).toHaveLength(2);
      expect((merged.nodes[0] as any).content).toBe('parent'); // Adjust access based on actual node type
      expect((merged.nodes[1] as any).content).toBe('child');  // Adjust access based on actual node type
      
      // Verify original states weren't modified
      expect(parent.imports.size).toBe(1);
      expect(child.imports.size).toBe(1);
      expect(parent.nodes).toHaveLength(1);
      expect(child.nodes).toHaveLength(1);
    });
  });

  describe('updateState', () => {
    it('should update state with new values', () => {
      const initial = factory.createState();
      const updates: Partial<StateNode> = {
        filePath: '/updated/file.md',
        variables: {
          text: new Map([['text', createTextVariable('text', 'updated', {})]]),
          data: new Map([['data', { value: { value: 'updated' } } as any]]),
          path: new Map([['path', { value: '/updated' } as any]])
        } as any // Cast needed as Partial<StateNode>['variables'] is complex
      };

      const updated = factory.updateState(initial, updates);

      expect(updated.filePath).toBe('/updated/file.md');
      expect(updated.variables.text.get('text')?.value).toBe('updated');
      expect(updated.variables.data.get('data')?.value).toEqual({ value: 'updated' });
      expect(updated.variables.path.get('path')?.value).toBe('/updated');
      
      // Verify original state wasn't modified
      expect(initial.variables.text.size).toBe(0);
      expect(initial.variables.data.size).toBe(0);
      expect(initial.variables.path.size).toBe(0);
    });

    it('should preserve unmodified values', () => {
      // Create initial state with some values
      const baseState = factory.createState();
      const initial = factory.updateState(baseState, {
        variables: {
          text: new Map([['preserved', createTextVariable('preserved', 'value', {})]])
        } as any // Cast needed
      });
      
      const updates: Partial<StateNode> = {
        filePath: '/updated/file.md'
      };

      const updated = factory.updateState(initial, updates);

      expect(updated.filePath).toBe('/updated/file.md');
      expect(updated.variables.text.get('preserved')?.value).toBe('value');
      
      // Verify values are copied, not referenced (this should pass now)
      expect(updated.variables.text).not.toBe(initial.variables.text);
    });
  });
}); 