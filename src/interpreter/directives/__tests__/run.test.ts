import { runDirectiveHandler } from '../run';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';

describe('RunDirectiveHandler', () => {
  let handler = runDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('should handle run directives', () => {
      expect(handler.canHandle('@run')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('@data')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store command in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@run',
          command: 'echo "test"'
        }
      };

      handler.handle(node, state);
      expect(state.getCommand('default')).toBe('echo "test"');
    });

    it('should store command with custom name', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@run',
          command: 'echo "test"',
          name: 'custom'
        }
      };

      handler.handle(node, state);
      expect(state.getCommand('custom')).toBe('echo "test"');
    });

    it('should throw error if command is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@run'
        } as any
      };

      expect(() => handler.handle(node, state)).toThrow('Run directive requires a command');
    });
  });
}); 