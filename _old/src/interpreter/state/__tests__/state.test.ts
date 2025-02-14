import { InterpreterState } from '../state.js';

describe('InterpreterState', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('text variables', () => {
    it('should store and retrieve text variables', () => {
      state.setTextVar('greeting', 'Hello');
      expect(state.getText('greeting')).toBe('Hello');
    });

    it('should return undefined for non-existent text variables', () => {
      expect(state.getText('nonexistent')).toBeUndefined();
    });

    it('should track local changes when setting text variables', () => {
      state.setTextVar('greeting', 'Hello');
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toContain('text:greeting');
    });
  });

  describe('data variables', () => {
    it('should store and retrieve data variables', () => {
      const data = { name: 'test', value: 123 };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toBe(data);
    });

    it('should return undefined for non-existent data variables', () => {
      expect(state.getDataVar('nonexistent')).toBeUndefined();
    });

    it('should track local changes when setting data variables', () => {
      state.setDataVar('config', { test: true });
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toContain('data:config');
    });
  });

  describe('path variables', () => {
    it('should store and retrieve path variables', () => {
      state.setPathVar('root', '/test/path');
      expect(state.getPathVar('root')).toBe('/test/path');
    });

    it('should return undefined for non-existent path variables', () => {
      expect(state.getPathVar('nonexistent')).toBeUndefined();
    });

    it('should track local changes when setting path variables', () => {
      state.setPathVar('root', '/test/path');
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toContain('path:root');
    });
  });

  describe('nodes', () => {
    it('should store and retrieve nodes', () => {
      const node = { type: 'test', value: 'test' };
      state.addNode(node);
      expect(state.getNodes()).toContain(node);
    });

    it('should track local changes when adding nodes', () => {
      const node = { type: 'test', value: 'test' };
      state.addNode(node);
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toContain('node:1');
    });
  });

  describe('imports', () => {
    it('should store and retrieve imports', () => {
      state.addImport('test.meld');
      expect(state.hasImport('test.meld')).toBe(true);
    });

    it('should not add duplicate imports', () => {
      state.addImport('test.meld');
      state.addImport('test.meld');
      expect(state.hasImport('test.meld')).toBe(true);
    });

    it('should track local changes when adding imports', () => {
      state.addImport('test.meld');
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toContain('import:test.meld');
    });
  });

  describe('immutability', () => {
    it('should prevent modification when immutable', () => {
      state.setImmutable();
      expect(() => state.setTextVar('test', 'value')).toThrow('Cannot modify immutable state');
    });

    it('should prevent adding imports when immutable', () => {
      state.setImmutable();
      expect(() => state.addImport('test.meld')).toThrow('Cannot modify immutable state');
    });

    it('should prevent adding nodes when immutable', () => {
      state.setImmutable();
      expect(() => state.addNode({ type: 'test' })).toThrow('Cannot modify immutable state');
    });
  });

  describe('parent state', () => {
    it('should inherit from parent state', () => {
      const parent = new InterpreterState();
      parent.setTextVar('greeting', 'Hello');
      
      const child = new InterpreterState(parent);
      expect(child.getText('greeting')).toBe('Hello');
    });

    it('should override parent values', () => {
      const parent = new InterpreterState();
      parent.setTextVar('greeting', 'Hello');
      
      const child = new InterpreterState(parent);
      child.setTextVar('greeting', 'Hi');
      expect(child.getText('greeting')).toBe('Hi');
    });

    it('should only merge changed values back to parent', () => {
      const parent = new InterpreterState();
      parent.setTextVar('unchanged', 'original');
      parent.setTextVar('changed', 'original');
      
      const child = new InterpreterState(parent);
      child.setTextVar('changed', 'modified');
      
      parent.mergeChildState(child);
      expect(parent.getText('unchanged')).toBe('original');
      expect(parent.getText('changed')).toBe('modified');
    });

    it('should merge changes through multiple levels', () => {
      const root = new InterpreterState();
      const parent = new InterpreterState(root);
      const child = new InterpreterState(parent);

      child.setTextVar('test', 'value');
      parent.mergeChildState(child);
      root.mergeChildState(parent);

      expect(root.getText('test')).toBe('value');
      expect(parent.getText('test')).toBe('value');
      expect(child.getText('test')).toBe('value');
    });

    it('should not merge to immutable parents', () => {
      const parent = new InterpreterState();
      parent.setImmutable();
      const child = new InterpreterState(parent);

      child.setTextVar('test', 'value');
      expect(() => parent.mergeChildState(child)).toThrow('Cannot modify immutable state');
    });
  });

  describe('file path handling', () => {
    it('should track file path changes', () => {
      state.setCurrentFilePath('/test/file.meld');
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toContain('file:/test/file.meld');
    });

    it('should inherit file path from parent', () => {
      const parent = new InterpreterState();
      parent.setCurrentFilePath('/test/parent.meld');
      
      const child = new InterpreterState(parent);
      child.setCurrentFilePath('/test/child.meld');
      
      parent.mergeChildState(child);
      expect(parent.getCurrentFilePath()).toBe('/test/child.meld');
    });
  });

  describe('local variable access', () => {
    it('should return copies of local variables', () => {
      state.setTextVar('test', 'value');
      const localVars = state.getLocalTextVars();
      localVars.set('test', 'modified');
      expect(state.getText('test')).toBe('value');
    });

    it('should not expose internal maps', () => {
      state.setDataVar('test', { value: true });
      const localVars = state.getLocalDataVars();
      localVars.clear();
      expect(state.getDataVar('test')).toEqual({ value: true });
    });
  });

  describe('enhanced mergeChildState', () => {
    it('should merge commands with options', () => {
      const parent = new InterpreterState();
      const child = new InterpreterState(parent);

      child.setCommand('custom', { output: 'test-cmd', options: { arg: 'value' } });
      parent.mergeChildState(child);
      
      const cmd = parent.getCommand('custom');
      expect(cmd).toBeDefined();
      expect(cmd?.command).toBe('test-cmd');
      expect(cmd?.options).toEqual({ arg: 'value' });
    });

    it('should handle all variable types in one merge', () => {
      const parent = new InterpreterState();
      const child = new InterpreterState(parent);

      child.setTextVar('text', 'value');
      child.setDataVar('data', { key: 'value' });
      child.setPathVar('path', '/test');
      child.setCommand('test', 'test-cmd');
      child.addImport('test.meld');
      child.addNode({ type: 'test', value: 'test' });

      parent.mergeChildState(child);

      expect(parent.getText('text')).toBe('value');
      expect(parent.getDataVar('data')).toEqual({ key: 'value' });
      expect(parent.getPathVar('path')).toBe('/test');
      expect(parent.getCommand('test')?.command).toBe('test-cmd');
      expect(parent.hasImport('test.meld')).toBe(true);
      expect(parent.getNodes()).toHaveLength(1);
    });

    it('should log state details before and after merge', () => {
      const parent = new InterpreterState();
      const child = new InterpreterState(parent);
      const spy = vi.spyOn(console, 'log');
      
      child.setTextVar('test', 'value');
      parent.mergeChildState(child);

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
}); 