import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { importDirectiveHandler } from '../import.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import * as fs from 'fs';

describe('ImportDirectiveHandler', () => {
  let handler = importDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();

    // Mock path module
    vi.mock('path', () => {
      const actual = {
        normalize: vi.fn().mockImplementation((p: string) => p),
        resolve: vi.fn().mockImplementation((p: string) => p),
        join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
        dirname: vi.fn().mockImplementation((p: string) => p.split('/').slice(0, -1).join('/')),
        basename: vi.fn().mockImplementation((p: string) => p.split('/').pop() || ''),
        extname: vi.fn().mockImplementation((p: string) => '.meld')
      };
      return {
        ...actual,
        default: actual
      };
    });

    // Mock fs module
    vi.mock('fs', () => ({
      readFileSync: vi.fn().mockImplementation((path: string) => {
        if (path === './config.meld') {
          return `
            @text text1 = "value1"
            @data data1 = { "key": "value" }
            @define cmd1 {
              @run echo "test"
            }
          `;
        }
        throw new Error('File not found');
      })
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('canHandle', () => {
    it('should handle import directives', () => {
      expect(handler.canHandle('import')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle shorthand import syntax', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: './config.meld'
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('text1')).toBe('value1');
      expect(state.getDataVar('data1')).toEqual({ key: 'value' });
      expect(state.getCommand('cmd1')).toBeDefined();
    });

    it('should import all variables with wildcard import', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: './config.meld',
          imports: ['*']
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('text1')).toBe('value1');
      expect(state.getDataVar('data1')).toEqual({ key: 'value' });
      expect(state.getCommand('cmd1')).toBeDefined();
    });

    it('should import specific variables with aliases', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: './config.meld',
          imports: ['text1', 'data1'],
          as: 'myText'
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('myText')).toBe('value1');
      expect(state.getDataVar('myData')).toEqual({ key: 'value' });
      expect(state.getTextVar('text1')).toBeUndefined();
    });

    it('should detect circular imports', () => {
      const node1: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: './config.meld'
        }
      };

      const node2: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: './config.meld'
        }
      };

      handler.handle(node1, state);
      expect(() => handler.handle(node2, state)).toThrow(
        'Circular import detected: ./config.meld'
      );
    });

    it('should validate import path', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'import',
          from: 'invalid.txt'
        }
      };

      expect(() => handler.handle(node, state)).toThrow('File not found');
    });
  });
}); 