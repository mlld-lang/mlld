import { InterpreterState } from '../state.js';

describe('InterpreterState', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('text variables', () => {
    it('should store and retrieve text variables', () => {
      state.setTextVar('greeting', 'Hello World');
      expect(state.getTextVar('greeting')).toBe('Hello World');
    });

    it('should return undefined for non-existent text variables', () => {
      expect(state.getTextVar('nonexistent')).toBeUndefined();
    });
  });

  describe('data variables', () => {
    it('should store and retrieve data variables', () => {
      const data = { foo: 'bar', num: 42 };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toEqual(data);
    });

    it('should return undefined for non-existent data variables', () => {
      expect(state.getDataVar('nonexistent')).toBeUndefined();
    });
  });

  describe('path variables', () => {
    it('should store and retrieve path variables', () => {
      state.setPathVar('root', '/usr/local');
      expect(state.getPathVar('root')).toBe('/usr/local');
    });

    it('should return undefined for non-existent path variables', () => {
      expect(state.getPathVar('nonexistent')).toBeUndefined();
    });
  });

  describe('commands', () => {
    it('should store and retrieve commands', () => {
      const cmd = () => console.log('test');
      state.setCommand('log', cmd);
      expect(state.getCommand('log')).toBe(cmd);
    });

    it('should return undefined for non-existent commands', () => {
      expect(state.getCommand('nonexistent')).toBeUndefined();
    });
  });

  describe('imports', () => {
    it('should track imports', () => {
      state.addImport('./config.meld');
      expect(state.hasImport('./config.meld')).toBe(true);
    });

    it('should return false for non-existent imports', () => {
      expect(state.hasImport('./nonexistent.meld')).toBe(false);
    });
  });

  describe('clone', () => {
    it('should create a deep copy of the state', () => {
      // Setup original state
      state.setTextVar('greeting', 'Hello');
      state.setDataVar('config', { foo: 'bar' });
      state.setPathVar('root', '/usr/local');
      state.setCommand('log', () => console.log('test'));
      state.addImport('./config.meld');

      // Clone the state
      const cloned = state.clone();

      // Verify all values are copied
      expect(cloned.getTextVar('greeting')).toBe('Hello');
      expect(cloned.getDataVar('config')).toEqual({ foo: 'bar' });
      expect(cloned.getPathVar('root')).toBe('/usr/local');
      expect(cloned.getCommand('log')).toBe(state.getCommand('log'));
      expect(cloned.hasImport('./config.meld')).toBe(true);

      // Verify modifications to clone don't affect original
      cloned.setTextVar('greeting', 'Hi');
      expect(state.getTextVar('greeting')).toBe('Hello');
      expect(cloned.getTextVar('greeting')).toBe('Hi');
    });
  });
}); 