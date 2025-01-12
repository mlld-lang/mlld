import { describe, it, expect } from 'vitest';
import { PathDirectiveHandler } from '../pathDirective.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'node:path';

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let state: InterpreterState;
  const originalEnv = process.env;
  const originalCwd = process.cwd;

  beforeEach(() => {
    handler = new PathDirectiveHandler();
    state = new InterpreterState();
    // Mock environment and cwd
    process.env = { ...originalEnv, HOME: '/Users/test' };
    process.cwd = vi.fn().mockReturnValue('/project/root');
    // Mock path module
    vi.mock('path', () => {
      const actual = {
        normalize: vi.fn().mockImplementation((p: string) => p),
        resolve: vi.fn().mockImplementation((p: string) => p),
        join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
        dirname: vi.fn().mockImplementation((p: string) => p.split('/').slice(0, -1).join('/')),
        basename: vi.fn().mockImplementation((p: string) => p.split('/').pop() || ''),
        extname: vi.fn().mockImplementation((p: string) => {
          const parts = p.split('.');
          return parts.length > 1 ? `.${parts.pop()}` : '';
        })
      };
      return {
        ...actual,
        default: actual
      };
    });
  });

  afterEach(() => {
    // Restore original values
    process.env = originalEnv;
    process.cwd = originalCwd;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('canHandle', () => {
    it('should handle path directives', () => {
      expect(handler.canHandle('path')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
      expect(handler.canHandle('text')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle $HOMEPATH variable', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'config',
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
          identifier: 'config',
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
          identifier: 'src',
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
          identifier: 'src',
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
          identifier: 'output',
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
          identifier: 'invalid',
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
        'Path directive requires an identifier'
      );
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'path',
          identifier: 'test'
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