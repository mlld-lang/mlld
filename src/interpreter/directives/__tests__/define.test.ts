import { defineDirectiveHandler } from '../define';
import { InterpreterState } from '../../state/state';
import { DirectiveRegistry } from '../registry';

describe('DefineDirectiveHandler', () => {
  const handler = defineDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(handler);
  });

  it('should handle define directives', () => {
    expect(handler.canHandle('@define')).toBe(true);
  });

  it('should store command definition', () => {
    const node = {
      type: 'Directive',
      directive: {
        kind: '@define',
        name: 'test',
        body: '@run echo hello'
      },
      location: { start: 0, end: 0 }
    };

    handler.handle(node, state);
    expect(state.getCommand('test')).toBe('echo hello');
  });

  it('should throw error if body is not a run directive', () => {
    const node = {
      type: 'Directive',
      directive: {
        kind: '@define',
        name: 'test',
        body: 'not a run directive'
      },
      location: { start: 0, end: 0 }
    };

    expect(() => handler.handle(node, state)).toThrow('Define directive body must be a @run directive');
  });

  it('should handle command definition without optional fields', () => {
    const node = {
      type: 'Directive',
      directive: {
        kind: '@define',
        name: 'test',
        body: {
          type: 'Directive',
          directive: {
            kind: '@run',
            command: 'echo hello'
          }
        }
      }
    };

    handler.handle(node, state);
    expect(state.getCommand('test')).toBe('echo hello');
  });
}); 