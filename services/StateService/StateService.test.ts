import { describe, it, expect, beforeEach } from 'vitest';
import { StateService } from './StateService.js';
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

    it('should return undefined for non-existent text variables', () => {
      expect(state.getTextVar('nonexistent')).toBeUndefined();
    });

    it('should get all text variables', () => {
      state.setTextVar('greeting', 'Hello');
      state.setTextVar('farewell', 'Goodbye');

      const vars = state.getAllTextVars();
      expect(vars.size).toBe(2);
      expect(vars.get('greeting')).toBe('Hello');
      expect(vars.get('farewell')).toBe('Goodbye');
    });

    it('should get local text variables', () => {
      state.setTextVar('local', 'value');
      expect(state.getLocalTextVars().get('local')).toBe('value');
    });
  });

  describe('data variables', () => {
    it('should set and get data variables', () => {
      const data = { foo: 'bar' };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toEqual(data);
    });

    it('should return undefined for non-existent data variables', () => {
      expect(state.getDataVar('nonexistent')).toBeUndefined();
    });

    it('should get all data variables', () => {
      state.setDataVar('config1', { foo: 'bar' });
      state.setDataVar('config2', { baz: 'qux' });

      const vars = state.getAllDataVars();
      expect(vars.size).toBe(2);
      expect(vars.get('config1')).toEqual({ foo: 'bar' });
      expect(vars.get('config2')).toEqual({ baz: 'qux' });
    });

    it('should get local data variables', () => {
      state.setDataVar('local', { value: true });
      expect(state.getLocalDataVars().get('local')).toEqual({ value: true });
    });
  });

  describe('path variables', () => {
    it('should set and get path variables', () => {
      state.setPathVar('root', '/path/to/root');
      expect(state.getPathVar('root')).toBe('/path/to/root');
    });

    it('should return undefined for non-existent path variables', () => {
      expect(state.getPathVar('nonexistent')).toBeUndefined();
    });

    it('should get all path variables', () => {
      state.setPathVar('root', '/root');
      state.setPathVar('temp', '/tmp');

      const vars = state.getAllPathVars();
      expect(vars.size).toBe(2);
      expect(vars.get('root')).toBe('/root');
      expect(vars.get('temp')).toBe('/tmp');
    });
  });

  describe('commands', () => {
    it('should set and get commands', () => {
      state.setCommand('test', 'echo test');
      expect(state.getCommand('test')).toEqual({ command: 'echo test' });
    });

    it('should set and get commands with options', () => {
      state.setCommand('test', { command: 'echo test', options: { silent: true } });
      expect(state.getCommand('test')).toEqual({ command: 'echo test', options: { silent: true } });
    });

    it('should get all commands', () => {
      state.setCommand('cmd1', 'echo 1');
      state.setCommand('cmd2', 'echo 2');

      const commands = state.getAllCommands();
      expect(commands.size).toBe(2);
      expect(commands.get('cmd1')).toEqual({ command: 'echo 1' });
      expect(commands.get('cmd2')).toEqual({ command: 'echo 2' });
    });
  });

  describe('nodes', () => {
    it('should add and get nodes', () => {
      const node: MeldNode = {
        type: 'text',
        value: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      state.addNode(node);
      expect(state.getNodes()).toEqual([node]);
    });

    it('should append content as text node', () => {
      state.appendContent('test content');
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('test content');
    });
  });

  describe('imports', () => {
    it('should add and check imports', () => {
      state.addImport('test.md');
      expect(state.hasImport('test.md')).toBe(true);
    });

    it('should remove imports', () => {
      state.addImport('test.md');
      state.removeImport('test.md');
      expect(state.hasImport('test.md')).toBe(false);
    });

    it('should get all imports', () => {
      state.addImport('file1.md');
      state.addImport('file2.md');

      const imports = state.getImports();
      expect(imports.size).toBe(2);
      expect(imports.has('file1.md')).toBe(true);
      expect(imports.has('file2.md')).toBe(true);
    });
  });

  describe('file path', () => {
    it('should set and get current file path', () => {
      state.setCurrentFilePath('/test/file.md');
      expect(state.getCurrentFilePath()).toBe('/test/file.md');
    });

    it('should return null when no file path is set', () => {
      expect(state.getCurrentFilePath()).toBeNull();
    });
  });

  describe('state management', () => {
    it('should prevent modifications when immutable', () => {
      state.setImmutable();
      expect(() => state.setTextVar('test', 'value')).toThrow('Cannot modify immutable state');
    });

    it('should create child state', () => {
      state.setTextVar('parent', 'value');
      const child = state.createChildState();
      expect(child.getTextVar('parent')).toBe('value');
    });

    it('should merge child state', () => {
      const child = state.createChildState();
      child.setTextVar('child', 'value');
      state.mergeChildState(child);
      expect(state.getTextVar('child')).toBe('value');
    });

    it('should clone state', () => {
      state.setTextVar('original', 'value');
      const clone = state.clone();
      expect(clone.getTextVar('original')).toBe('value');

      // Verify modifications don't affect original
      clone.setTextVar('new', 'value');
      expect(state.getTextVar('new')).toBeUndefined();
    });

    it('should track local changes', () => {
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toEqual(['state']);
    });
  });
}); 