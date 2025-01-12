import { DirectiveNode, Location } from 'meld-spec';
import { InterpreterState } from '../../state/state';
import { textDirectiveHandler } from '../text';
import { MeldDirectiveError } from '../../errors/errors';
import { HandlerContext } from '../types';

describe('TextDirectiveHandler', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('returns true for @text directives in top-level mode', () => {
      expect(textDirectiveHandler.canHandle('@text', 'toplevel')).toBe(true);
    });

    it('returns true for @text directives in right-side mode', () => {
      expect(textDirectiveHandler.canHandle('@text', 'rightside')).toBe(true);
    });

    it('returns false for other directives', () => {
      expect(textDirectiveHandler.canHandle('@data', 'toplevel')).toBe(false);
      expect(textDirectiveHandler.canHandle('@data', 'rightside')).toBe(false);
    });
  });

  describe('handle in top-level mode', () => {
    const context: HandlerContext = { mode: 'toplevel' };

    it('sets text variable with string value', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'test',
          value: 'hello'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      textDirectiveHandler.handle(node, state, context);
      expect(state.getText('test')).toBe('hello');
    });

    it('joins array values', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'test',
          value: ['hello', ' ', 'world']
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      textDirectiveHandler.handle(node, state, context);
      expect(state.getText('test')).toBe('hello world');
    });

    it('throws if name is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          value: 'hello'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => textDirectiveHandler.handle(node, state, context))
        .toThrow(MeldDirectiveError);
    });

    it('throws if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'test'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => textDirectiveHandler.handle(node, state, context))
        .toThrow(MeldDirectiveError);
    });
  });

  describe('handle in right-side mode', () => {
    const baseLocation: Location = {
      start: { line: 10, column: 3 },
      end: { line: 15, column: 1 }
    };
    const context: HandlerContext = { 
      mode: 'rightside',
      baseLocation
    };

    it('sets text variable with string value', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'test',
          value: 'hello'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      textDirectiveHandler.handle(node, state, context);
      expect(state.getText('test')).toBe('hello');
    });

    it('adjusts error location in right-side mode', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          value: 'hello'
        },
        location: {
          start: { line: 1, column: 5 },
          end: { line: 1, column: 10 }
        }
      };

      try {
        textDirectiveHandler.handle(node, state, context);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldDirectiveError);
        expect((error as MeldDirectiveError).location).toEqual({
          line: 10,
          column: 7
        });
      }
    });
  });
}); 