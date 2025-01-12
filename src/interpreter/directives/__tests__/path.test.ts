import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pathDirectiveHandler } from '../path';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';
import * as path from 'path';
import { MeldDirectiveError } from '../../errors/errors';

describe('PathDirectiveHandler', () => {
  let state: InterpreterState;
  let context = { projectRoot: '/project/root' };

  beforeEach(() => {
    state = new InterpreterState();
    vi.mock('path', () => ({
      resolve: vi.fn().mockImplementation((...args) => args.join('/')),
      join: vi.fn().mockImplementation((...args) => args.join('/')),
      dirname: vi.fn().mockImplementation((p) => p.split('/').slice(0, -1).join('/')),
      normalize: vi.fn().mockImplementation((p) => p)
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('canHandle', () => {
    it('should return true for path directives', () => {
      expect(pathDirectiveHandler.canHandle('path')).toBe(true);
    });

    it('should return false for other directives', () => {
      expect(pathDirectiveHandler.canHandle('text')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store path variable', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test',
          value: '$PROJECTPATH/test'
        }
      };

      pathDirectiveHandler.handle(node, state, context);
      expect(state.getPathVar('test')).toBe('$PROJECTPATH/test');
    });

    it('should handle array values', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test',
          value: ['$PROJECTPATH/test1', '$PROJECTPATH/test2']
        }
      };

      pathDirectiveHandler.handle(node, state, context);
      expect(state.getPathVar('test')).toBe('$PROJECTPATH/test1:$PROJECTPATH/test2');
    });

    it('should handle $~ shorthand', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test',
          value: '$~/test'
        }
      };

      pathDirectiveHandler.handle(node, state, context);
      expect(state.getPathVar('test')).toBe('$~/test');
    });

    it('should handle $PROJECTPATH', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test',
          value: '$PROJECTPATH/test'
        }
      };

      pathDirectiveHandler.handle(node, state, context);
      expect(state.getPathVar('test')).toBe('$PROJECTPATH/test');
    });

    it('should handle $. shorthand', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test',
          value: '$./test'
        }
      };

      pathDirectiveHandler.handle(node, state, context);
      expect(state.getPathVar('test')).toBe('$./test');
    });

    it('should throw error if name is missing', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          value: '$PROJECTPATH/test'
        }
      };

      expect(() => pathDirectiveHandler.handle(node, state, context)).toThrow(MeldDirectiveError);
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test'
        }
      };

      expect(() => pathDirectiveHandler.handle(node, state, context)).toThrow(MeldDirectiveError);
    });

    it('should throw error if path does not start with variable', () => {
      const node: DirectiveNode = {
        type: 'directive',
        directive: {
          kind: 'path',
          name: 'test',
          value: 'invalid/path'
        }
      };

      expect(() => pathDirectiveHandler.handle(node, state, context)).toThrow(MeldDirectiveError);
    });
  });
}); 