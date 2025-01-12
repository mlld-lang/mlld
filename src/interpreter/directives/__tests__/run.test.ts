import { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../state/state';
import { runDirectiveHandler } from '../run';
import { MeldDirectiveError } from '../../errors/errors';
import { HandlerContext } from '../types';

describe('RunDirectiveHandler', () => {
  let state: InterpreterState;
  const context: HandlerContext = { mode: 'toplevel' };

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('returns true for @run directives in top-level mode', () => {
      expect(runDirectiveHandler.canHandle('@run', 'toplevel')).toBe(true);
    });

    it('returns true for @run directives in right-side mode', () => {
      expect(runDirectiveHandler.canHandle('@run', 'rightside')).toBe(true);
    });
  });

  describe('handle', () => {
    it('should store command in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@run',
          command: 'echo "Hello World"'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      runDirectiveHandler.handle(node, state, context);
      const command = state.getCommand();
      expect(command).toBeDefined();
      expect(command?.command).toBe('echo "Hello World"');
      expect(command?.background).toBe(false);
    });

    it('should store command with custom name', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@run',
          command: 'echo "Hello World"',
          name: 'greet'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      runDirectiveHandler.handle(node, state, context);
      const command = state.getCommand('greet');
      expect(command).toBeDefined();
      expect(command?.command).toBe('echo "Hello World"');
      expect(command?.background).toBe(false);
    });

    it('should throw error if command is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@run'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => runDirectiveHandler.handle(node, state, context)).toThrow('Run directive requires a command');
    });
  });
}); 