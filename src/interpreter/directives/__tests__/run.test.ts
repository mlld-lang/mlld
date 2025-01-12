import { RunDirectiveHandler } from '../run.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';

describe('RunDirectiveHandler', () => {
  let handler: RunDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    handler = new RunDirectiveHandler();
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('should handle run directives', () => {
      expect(handler.canHandle('run')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('import')).toBe(false);
      expect(handler.canHandle('text')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store command in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          command: 'echo "test"'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const pendingCommand = state.getDataVar('__pendingCommand');
      expect(pendingCommand).toEqual({
        command: 'echo "test"',
        background: false,
        location: node.location
      });
    });

    it('should handle background commands', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          command: 'sleep 10',
          background: true
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);

      const pendingCommand = state.getDataVar('__pendingCommand');
      expect(pendingCommand).toEqual({
        command: 'sleep 10',
        background: true,
        location: node.location
      });
    });

    it('should throw error if command is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Run directive requires a command'
      );
    });
  });
}); 