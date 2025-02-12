import { describe, it, expect, beforeEach } from 'vitest';
import { StateService } from './StateService';
import type { MeldNode } from 'meld-spec';

describe('StateService', () => {
  let state: StateService;

  beforeEach(() => {
    state = new StateService();
  });

  describe('text variables', () => {
    it('should set and get text variables', () => {
      state.setTextVar('greeting', 'Hello');
      expect(state.getTextVar('greeting')).toBe('Hello');
    });

    it('should inherit text variables from parent', () => {
      const parent = new StateService();
      parent.setTextVar('greeting', 'Hello');
      const child = new StateService(parent);
      expect(child.getTextVar('greeting')).toBe('Hello');
    });

    it('should override parent text variables', () => {
      const parent = new StateService();
      parent.setTextVar('greeting', 'Hello');
      const child = new StateService(parent);
      child.setTextVar('greeting', 'Hi');
      expect(child.getTextVar('greeting')).toBe('Hi');
      expect(parent.getTextVar('greeting')).toBe('Hello');
    });
  });

  describe('data variables', () => {
    it('should set and get data variables', () => {
      const data = { foo: 'bar' };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toEqual(data);
    });

    it('should inherit data variables from parent', () => {
      const parent = new StateService();
      const data = { foo: 'bar' };
      parent.setDataVar('config', data);
      const child = new StateService(parent);
      expect(child.getDataVar('config')).toEqual(data);
    });
  });

  describe('path variables', () => {
    it('should set and get path variables', () => {
      state.setPathVar('root', '/path/to/root');
      expect(state.getPathVar('root')).toBe('/path/to/root');
    });
  });

  describe('immutability', () => {
    it('should prevent modifications when immutable', () => {
      state.setTextVar('test', 'value');
      state.setImmutable();
      expect(() => state.setTextVar('test', 'new value')).toThrow('Cannot modify immutable state');
    });
  });

  describe('child state', () => {
    it('should create child state with parent reference', () => {
      const child = state.createChildState();
      state.setTextVar('parent', 'value');
      expect(child.getTextVar('parent')).toBe('value');
    });

    it('should merge child state changes to parent', () => {
      const child = state.createChildState();
      child.setTextVar('test', 'value');
      state.mergeChildState(child);
      expect(state.getTextVar('test')).toBe('value');
    });
  });

  describe('node handling', () => {
    it('should add and retrieve nodes', () => {
      const node: MeldNode = {
        type: 'text',
        content: 'test content',
        location: { line: 1, column: 1 }
      };
      state.addNode(node);
      expect(state.getNodes()).toContainEqual(node);
    });
  });

  describe('import tracking', () => {
    it('should track imports', () => {
      state.addImport('/path/to/file.meld');
      expect(state.hasImport('/path/to/file.meld')).toBe(true);
    });

    it('should remove imports', () => {
      state.addImport('/path/to/file.meld');
      state.removeImport('/path/to/file.meld');
      expect(state.hasImport('/path/to/file.meld')).toBe(false);
    });
  });

  describe('cloning', () => {
    it('should create an independent copy', () => {
      state.setTextVar('test', 'value');
      state.setDataVar('data', { foo: 'bar' });
      const clone = state.clone();
      
      // Modify original
      state.setTextVar('test', 'new value');
      
      // Clone should maintain original values
      expect(clone.getTextVar('test')).toBe('value');
      expect(clone.getDataVar('data')).toEqual({ foo: 'bar' });
    });

    it('should preserve immutability in clone', () => {
      state.setImmutable();
      const clone = state.clone();
      expect(clone.isImmutable).toBe(true);
      expect(() => clone.setTextVar('test', 'value')).toThrow('Cannot modify immutable state');
    });
  });
}); 