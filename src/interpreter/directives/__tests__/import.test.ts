import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportDirectiveHandler } from '../import.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import * as fs from 'fs';
import * as path from 'path';
import { parseMeldContent } from '../../parser.js';
import { interpret } from '../../interpreter.js';

// Mock all external dependencies
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn()
  },
  readFileSync: vi.fn()
}));

vi.mock('path', () => ({
  default: {
    extname: vi.fn(),
    isAbsolute: vi.fn()
  },
  extname: vi.fn(),
  isAbsolute: vi.fn()
}));

vi.mock('../../parser.js', () => ({
  parseMeldContent: vi.fn()
}));

vi.mock('../../interpreter.js', () => ({
  interpret: vi.fn()
}));

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    vi.resetAllMocks();
    handler = new ImportDirectiveHandler();
    state = new InterpreterState();

    // Setup default mock implementations
    vi.mocked(fs.readFileSync).mockReturnValue('mock content');
    vi.mocked(path.extname).mockReturnValue('.meld');
    vi.mocked(path.isAbsolute).mockReturnValue(false);
    vi.mocked(parseMeldContent).mockReturnValue([]);
    vi.mocked(interpret).mockImplementation(() => {});
  });

  describe('canHandle', () => {
    it('should handle import directives', () => {
      expect(handler.canHandle('import')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
      expect(handler.canHandle('data')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle shorthand import syntax', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          shorthand: './config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(fs.readFileSync).toHaveBeenCalledWith('./config.meld', 'utf8');
      expect(parseMeldContent).toHaveBeenCalledWith('mock content');
      expect(interpret).toHaveBeenCalled();
    });

    it('should import all variables with wildcard import', () => {
      // Setup imported state with variables
      const importedState = new InterpreterState();
      importedState.setTextVar('text1', 'value1');
      importedState.setDataVar('data1', { key: 'value' });
      importedState.setCommand('cmd1', () => {});

      vi.mocked(interpret).mockImplementation((_, state) => {
        state.textVariables = importedState.textVariables;
        state.dataVariables = importedState.dataVariables;
        state.definedCommands = importedState.definedCommands;
      });

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: '*',
          from: './config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(state.getTextVar('text1')).toBe('value1');
      expect(state.getDataVar('data1')).toEqual({ key: 'value' });
      expect(state.getCommand('cmd1')).toBeDefined();
    });

    it('should import specific variables with aliases', () => {
      // Setup imported state with variables
      const importedState = new InterpreterState();
      importedState.setTextVar('text1', 'value1');
      importedState.setDataVar('data1', { key: 'value' });

      vi.mocked(interpret).mockImplementation((_, state) => {
        state.textVariables = importedState.textVariables;
        state.dataVariables = importedState.dataVariables;
      });

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: [
            { source: 'text1', alias: 'myText' },
            { source: 'data1', alias: 'myData' }
          ],
          from: './config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      expect(state.getTextVar('myText')).toBe('value1');
      expect(state.getDataVar('myData')).toEqual({ key: 'value' });
      expect(state.getTextVar('text1')).toBeUndefined();
      expect(state.getDataVar('data1')).toBeUndefined();
    });

    it('should detect circular imports', () => {
      // First import
      const node1: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: '*',
          from: './config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      // Second import (circular)
      const node2: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: '*',
          from: './config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node1, state);
      expect(() => handler.handle(node2, state)).toThrow(
        'Circular import detected: ./config.meld'
      );
    });

    it('should validate import path', () => {
      vi.mocked(path.extname).mockReturnValue('');
      vi.mocked(path.isAbsolute).mockReturnValue(false);
      
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: 'invalid-path',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow('Import path must be a valid file path');
    });
  });
}); 