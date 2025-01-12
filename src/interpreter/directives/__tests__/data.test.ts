import { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../state/state';
import { dataDirectiveHandler } from '../data';
import { MeldDirectiveError } from '../../errors/errors';
import { HandlerContext } from '../types';

describe('DataDirectiveHandler', () => {
  let state: InterpreterState;
  const context: HandlerContext = { mode: 'toplevel' };

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('returns true for @data directives in top-level mode', () => {
      expect(dataDirectiveHandler.canHandle('@data', 'toplevel')).toBe(true);
    });

    it('returns true for @data directives in right-side mode', () => {
      expect(dataDirectiveHandler.canHandle('@data', 'rightside')).toBe(true);
    });
  });

  describe('handle', () => {
    it('should store object literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          name: 'config',
          value: { key: 'value' }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      dataDirectiveHandler.handle(node, state, context);
      expect(state.getDataVar('config')).toEqual({ key: 'value' });
    });

    it('should store array literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          name: 'list',
          value: [1, 2, 3]
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      dataDirectiveHandler.handle(node, state, context);
      expect(state.getDataVar('list')).toEqual([1, 2, 3]);
    });

    it('should store string literal in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          name: 'message',
          value: 'hello'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      dataDirectiveHandler.handle(node, state, context);
      expect(state.getDataVar('message')).toBe('hello');
    });

    it('should throw error if identifier is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          value: { key: 'value' }
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => dataDirectiveHandler.handle(node, state, context)).toThrow(
        'Data directive requires a name'
      );
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@data',
          name: 'config'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => dataDirectiveHandler.handle(node, state, context)).toThrow(
        'Data directive requires a value'
      );
    });
  });
}); 