import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateFactory } from './StateFactory.js';
import type { StateNode, IStateFactory } from './types.js';
import { TestContextDI } from '../../../tests/utils/di/TestContextDI';

describe('StateFactory', () => {
  let factory: IStateFactory;
  let context: TestContextDI;

  beforeEach(() => {
    // Create test context with DI
    context = TestContextDI.create({ isolatedContainer: true });
    
    // Get service instance using DI
    factory = context.resolveSync<IStateFactory>('IStateFactory');
  });

  afterEach(async () => {
    await context.cleanup();
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
      expect(state.parentState).toBeUndefined();
    });

    it('should create state with options', () => {
      const parent = factory.createState();
      const state = factory.createState({
        parentState: parent,
        filePath: '/test/file.md',
        source: 'test'
      });

      expect(state.parentState).toBe(parent);
      expect(state.filePath).toBe('/test/file.md');
    });

    it('should inherit parent state', () => {
      // Create parent with some state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['inherited', 'value']]),
          data: new Map([['config', { inherited: true }]]),
          path: new Map([['root', '/parent']])
        },
        imports: new Set(['parent.md']),
        nodes: [{ type: 'text', value: 'parent' } as any]
      });

      // Create child state
      const child = factory.createState({ parentState: parent });

      // Verify inheritance
      expect(child.variables.text.get('inherited')).toBe('value');
      expect(child.variables.data.get('config')).toEqual({ inherited: true });
      expect(child.variables.path.get('root')).toBe('/parent');
      expect(child.imports.has('parent.md')).toBe(true);
      expect(child.nodes[0].value).toBe('parent');
    });
  });

  describe('createChildState', () => {
    it('should create child state with parent reference', () => {
      const parent = factory.createState();
      const child = factory.createChildState(parent);

      expect(child.parentState).toBe(parent);
    });

    it('should create empty child state that inherits parent values', () => {
      // Create parent with some state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['text', 'parent']]),
          data: new Map([['data', { value: 'parent' }]]),
          path: new Map([['path', '/parent']])
        }
      });

      const child = factory.createChildState(parent);

      // Verify child inherits parent values
      expect(child.variables.text.get('text')).toBe('parent');
      expect(child.variables.data.get('data')).toEqual({ value: 'parent' });
      expect(child.variables.path.get('path')).toBe('/parent');
    });
  });

  describe('mergeStates', () => {
    it('should merge variables from child to parent', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['parentText', 'parent']]),
          data: new Map([['parentData', { value: 'parent' }]]),
          path: new Map([['parentPath', '/parent']])
        }
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        variables: {
          text: new Map([['childText', 'child']]),
          data: new Map([['childData', { value: 'child' }]]),
          path: new Map([['childPath', '/child']])
        }
      });

      const merged = factory.mergeStates(parent, child);

      // Check merged variables
      expect(merged.variables.text.get('parentText')).toBe('parent');
      expect(merged.variables.text.get('childText')).toBe('child');
      expect(merged.variables.data.get('parentData')).toEqual({ value: 'parent' });
      expect(merged.variables.data.get('childData')).toEqual({ value: 'child' });
      expect(merged.variables.path.get('parentPath')).toBe('/parent');
      expect(merged.variables.path.get('childPath')).toBe('/child');
    });

    it('should override parent variables with child values', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        variables: {
          text: new Map([['text', 'parent']])
        }
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        variables: {
          text: new Map([['text', 'child']])
        }
      });

      const merged = factory.mergeStates(parent, child);

      expect(merged.variables.text.get('text')).toBe('child');
      // Verify parent state wasn't modified
      expect(parent.variables.text.get('text')).toBe('parent');
    });

    it('should merge imports and nodes', () => {
      // Create parent state
      const parentBase = factory.createState();
      const parent = factory.updateState(parentBase, {
        imports: new Set(['parent.md']),
        nodes: [{ type: 'text', value: 'parent' } as any]
      });

      // Create child state
      const childBase = factory.createState();
      const child = factory.updateState(childBase, {
        imports: new Set(['child.md']),
        nodes: [{ type: 'text', value: 'child' } as any]
      });

      const merged = factory.mergeStates(parent, child);

      expect(merged.imports.has('parent.md')).toBe(true);
      expect(merged.imports.has('child.md')).toBe(true);
      expect(merged.nodes).toHaveLength(2);
      expect(merged.nodes[0].value).toBe('parent');
      expect(merged.nodes[1].value).toBe('child');
      
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
          text: new Map([['text', 'updated']]),
          data: new Map([['data', { value: 'updated' }]]),
          path: new Map([['path', '/updated']])
        }
      };

      const updated = factory.updateState(initial, updates);

      expect(updated.filePath).toBe('/updated/file.md');
      expect(updated.variables.text.get('text')).toBe('updated');
      expect(updated.variables.data.get('data')).toEqual({ value: 'updated' });
      expect(updated.variables.path.get('path')).toBe('/updated');
      
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
          text: new Map([['preserved', 'value']])
        }
      });
      
      const updates: Partial<StateNode> = {
        filePath: '/updated/file.md'
      };

      const updated = factory.updateState(initial, updates);

      expect(updated.filePath).toBe('/updated/file.md');
      expect(updated.variables.text.get('preserved')).toBe('value');
      
      // Verify values are copied, not referenced
      expect(updated.variables.text).not.toBe(initial.variables.text);
    });
  });
}); 