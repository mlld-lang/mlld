import { DirectiveNode } from 'meld-spec';
import { InterpreterState } from '../../state/state';
import { defineDirectiveHandler } from '../define';
import { MeldDirectiveError } from '../../errors/errors';
import { HandlerContext } from '../types';

describe('DefineDirectiveHandler', () => {
  let state: InterpreterState;
  const context: HandlerContext = { mode: 'toplevel' };
  const handler = defineDirectiveHandler;

  beforeEach(() => {
    state = new InterpreterState();
  });

  it('should handle define directives', () => {
    expect(handler.canHandle('@define', 'toplevel')).toBe(true);
    expect(handler.canHandle('@define', 'rightside')).toBe(true);
  });

  it('should store command definition', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: '@define',
        name: 'test',
        description: 'Test command',
        value: {
          type: 'Directive',
          directive: {
            kind: '@run',
            command: 'echo "test"'
          }
        }
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    };

    handler.handle(node, state, context);
    const command = state.getCommand('test');
    expect(command).toBeDefined();
    expect(command?.command).toBe('echo "test"');
  });

  it('should throw error if body is not a run directive', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: '@define',
        name: 'test',
        value: {
          type: 'Directive',
          directive: {
            kind: '@text',
            name: 'test',
            value: 'test'
          }
        }
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    };

    expect(() => handler.handle(node, state, context)).toThrow('Define directive body must be a @run directive');
  });

  it('should handle command definition without optional fields', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: '@define',
        name: 'test',
        value: {
          type: 'Directive',
          directive: {
            kind: '@run',
            command: 'echo "test"'
          }
        }
      },
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    };

    handler.handle(node, state, context);
    const command = state.getCommand('test');
    expect(command).toBeDefined();
    expect(command?.command).toBe('echo "test"');
  });
}); 