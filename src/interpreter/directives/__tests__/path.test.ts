import { describe, it, expect } from 'vitest';
import { pathDirectiveHandler } from '../pathDirective.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import { vi } from 'vitest';

describe('PathDirectiveHandler', () => {
  let handler = pathDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    // Mock environment and cwd
    vi.stubEnv('HOME', '/home/user');
    vi.spyOn(process, 'cwd').mockReturnValue('/project/path');
  });

  describe('canHandle', () => {
    it('should handle path directives', () => {
      expect(handler.canHandle('path')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle $HOMEPATH variable', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'config',
          value: '$HOMEPATH/config'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getPathVar('config')).toBe('/Users/test/config');
    });

    it('should handle $~ shorthand for home', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'config',
          value: '$~/config'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getPathVar('config')).toBe('/Users/test/config');
    });

    it('should handle $PROJECTPATH variable', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'src',
          value: '$PROJECTPATH/src'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getPathVar('src')).toBe('/project/root/src');
    });

    it('should handle $. shorthand for project path', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'src',
          value: '$./src'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getPathVar('src')).toBe('/project/root/src');
    });

    it('should handle string concatenation with array values', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'output',
          value: ['$PROJECTPATH', '/build', '/output']
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getPathVar('output')).toBe('/project/root/build/output');
    });

    it('should throw error for paths not starting with special variable', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'invalid',
          value: '/absolute/path'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.'
      );
    });

    it('should throw error if identifier is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          value: '$HOMEPATH/test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Path directive requires a name'
      );
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          name: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Path directive requires a value'
      );
    });
  });
}); 