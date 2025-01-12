import { defineDirectiveHandler } from '../define.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';

describe('DefineDirectiveHandler', () => {
  let handler = defineDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
  });

  it('should handle define directives', () => {
    expect(handler.canHandle('define')).toBe(true);
  });

  it('should store command definition', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'define',
        name: 'test',
        body: '@run echo "hello"'
      }
    };

    handler.handle(node, state);
    expect(state.getCommand('test')).toBeDefined();
  });

  it('should throw error if body is not a run directive', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'define',
        name: 'invalid-command',
        body: {
          type: 'Directive',
          directive: {
            kind: 'data'
          }
        }
      }
    };

    expect(() => handler.handle(node, state)).toThrow('Define directive body must be a @run directive');
  });

  it('should handle command definition without optional fields', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'define',
        name: 'simple-command',
        body: {
          type: 'Directive',
          directive: {
            kind: 'run',
            command: 'echo simple'
          }
        }
      }
    };

    handler.handle(node, state);

    const stored = state.getCommand('simple-command');
    expect(stored).toBeDefined();
    expect(typeof stored).toBe('function');
  });
}); 