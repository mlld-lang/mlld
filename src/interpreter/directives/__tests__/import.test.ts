import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { importDirectiveHandler } from '../import';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import * as fs from 'fs';
import { DirectiveRegistry } from '../registry';

describe('ImportDirectiveHandler', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(importDirectiveHandler);

    // Mock path module
    vi.mock('path', () => ({
      normalize: vi.fn().mockImplementation((p: string) => p),
      resolve: vi.fn().mockImplementation((p: string) => p),
      join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
      dirname: vi.fn().mockImplementation((p: string) => p.split('/').slice(0, -1).join('/')),
      basename: vi.fn().mockImplementation((p: string) => p.split('/').pop() || ''),
      extname: vi.fn().mockImplementation((p: string) => '.meld')
    }));

    // Mock fs module
    vi.mock('fs', () => ({
      existsSync: vi.fn().mockImplementation((path: string) => path === './test.meld'),
      readFileSync: vi.fn().mockImplementation((path: string) => {
        if (path === './test.meld') {
          return `@text test = "value"`;
        }
        throw new Error('File not found');
      }),
      promises: {
        readFile: vi.fn().mockImplementation(async (path: string) => {
          if (path === './test.meld') {
            return `@text test = "value"`;
          }
          throw new Error('File not found');
        })
      }
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should handle import directives', () => {
      expect(importDirectiveHandler.canHandle('@import', 'toplevel')).toBe(true);
      expect(importDirectiveHandler.canHandle('@import', 'rightside')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(importDirectiveHandler.canHandle('@run', 'toplevel')).toBe(false);
      expect(importDirectiveHandler.canHandle('@data', 'rightside')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle shorthand import syntax', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@import',
          from: './config.meld'
        }
      };

      importDirectiveHandler.handle(node, state, { mode: 'toplevel' });
      expect(state.getText('text1')).toBe('value1');
      expect(state.getDataVar('data1')).toEqual({ key: 'value' });
      expect(state.getCommand('cmd1')).toBeDefined();
    });

    it('should import all variables with wildcard import', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@import',
          from: './config.meld',
          imports: ['*']
        }
      };

      importDirectiveHandler.handle(node, state, { mode: 'toplevel' });
      expect(state.getText('text1')).toBe('value1');
      expect(state.getDataVar('data1')).toEqual({ key: 'value' });
      expect(state.getCommand('cmd1')).toBeDefined();
    });

    it('should import specific variables with aliases', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@import',
          from: './config.meld',
          imports: ['text1', 'data1'],
          as: 'myText'
        }
      };

      importDirectiveHandler.handle(node, state, { mode: 'toplevel' });
      expect(state.getText('myText')).toBe('value1');
      expect(state.getDataVar('myData')).toEqual({ key: 'value' });
      expect(state.getText('text1')).toBeUndefined();
    });

    it('should detect circular imports', () => {
      const node1: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@import',
          from: './config.meld'
        }
      };

      const node2: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@import',
          from: './config.meld'
        }
      };

      importDirectiveHandler.handle(node1, state, { mode: 'toplevel' });
      expect(() => importDirectiveHandler.handle(node2, state, { mode: 'toplevel' })).toThrow(
        'Circular import detected'
      );
    });

    it('should validate import path', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@import',
          from: 'invalid.txt'
        }
      };

      expect(() => importDirectiveHandler.handle(node, state, { mode: 'toplevel' })).toThrow('File not found');
    });
  });
}); 