import { describe, it, expect, beforeEach } from 'vitest';
import { dataDirectiveHandler } from '../data.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import { MeldDirectiveError } from '../../errors/errors.js';
import { DirectiveRegistry } from '../registry.js';

describe('DataDirectiveHandler', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(dataDirectiveHandler);
  });

  describe('canHandle', () => {
    it('should handle data directives', () => {
      expect(dataDirectiveHandler.canHandle('@data')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(dataDirectiveHandler.canHandle('@run')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store object literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          identifier: 'config',
          value: { name: 'test', version: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      dataDirectiveHandler.handle(node, state);

      const storedData = state.getDataVar('config');
      expect(storedData).toEqual({ name: 'test', version: 1 });
    });

    it('should store array literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          identifier: 'list',
          value: [1, 2, 3]
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      dataDirectiveHandler.handle(node, state);

      const storedData = state.getDataVar('list');
      expect(storedData).toEqual([1, 2, 3]);
    });

    it('should store string literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          identifier: 'message',
          value: 'Hello World'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      dataDirectiveHandler.handle(node, state);

      const storedData = state.getDataVar('message');
      expect(storedData).toBe('Hello World');
    });

    it('should throw error if identifier is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          value: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => dataDirectiveHandler.handle(node, state)).toThrow(
        'Data directive requires an identifier'
      );
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          identifier: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => dataDirectiveHandler.handle(node, state)).toThrow(
        'Data directive requires a value'
      );
    });
  });
}); 