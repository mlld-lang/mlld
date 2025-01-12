import { ImportDirectiveHandler } from '../import.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import fs from 'fs';
import path from 'path';
import { parseMeldContent } from '../../parser.js';
import { interpret } from '../../interpreter.js';

// Mock fs, path, and parser modules
jest.mock('fs');
jest.mock('path');
jest.mock('../../parser.js');
jest.mock('../../interpreter.js');

describe('ImportDirectiveHandler', () => {
  let handler: ImportDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    handler = new ImportDirectiveHandler();
    state = new InterpreterState();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (fs.readFileSync as jest.Mock).mockReturnValue('mock content');
    (parseMeldContent as jest.Mock).mockReturnValue([]);
    (path.extname as jest.Mock).mockReturnValue('.md');
    (path.isAbsolute as jest.Mock).mockReturnValue(false);
  });

  describe('canHandle', () => {
    it('should handle import directives', () => {
      expect(handler.canHandle('import')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
      expect(handler.canHandle('text')).toBe(false);
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

      (interpret as jest.Mock).mockImplementation((_, state) => {
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

      (interpret as jest.Mock).mockImplementation((_, state) => {
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

    it('should enforce imports at top of file', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: '*',
          from: './config.meld',
          location: { line: 5, column: 1 }
        },
        location: {
          start: { line: 5, column: 1 },
          end: { line: 5, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Import directives must appear at the top of the file'
      );
    });

    it('should validate import paths', () => {
      (path.isAbsolute as jest.Mock).mockReturnValue(true);

      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: '*',
          from: '/absolute/path/config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Import path must be a valid file path'
      );
    });

    it('should validate import item identifiers', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: [
            { source: '123invalid' },
            { source: 'valid', alias: '123invalid' }
          ],
          from: './config.meld',
          location: { line: 1, column: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Invalid import source: 123invalid'
      );
    });

    it('should throw error if source file path is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          items: '*'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Import directive requires a source file path'
      );
    });
  });
}); 