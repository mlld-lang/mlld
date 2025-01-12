import { DataDirectiveHandler } from '../data';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-ast';

describe('DataDirectiveHandler', () => {
  let handler: DataDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    handler = new DataDirectiveHandler();
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('should handle data directives', () => {
      expect(handler.canHandle('data')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
      expect(handler.canHandle('text')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store object literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'config',
          value: { name: 'test', version: 1 }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const storedData = state.getDataVar('config');
      expect(storedData).toEqual({ name: 'test', version: 1 });
    });

    it('should store array literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'list',
          value: [1, 2, 3]
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const storedData = state.getDataVar('list');
      expect(storedData).toEqual([1, 2, 3]);
    });

    it('should store string literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'message',
          value: 'Hello World'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const storedData = state.getDataVar('message');
      expect(storedData).toBe('Hello World');
    });

    it('should throw error if identifier is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          value: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Data directive requires an identifier'
      );
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Data directive requires a value'
      );
    });
  });
}); 