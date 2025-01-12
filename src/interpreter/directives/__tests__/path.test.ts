import { describe, it, expect } from 'vitest';
import { pathDirectiveHandler } from '../path.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';
import { DirectiveRegistry } from '../registry.js';

describe('PathDirectiveHandler', () => {
  const handler = pathDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(handler);
  });

  describe('canHandle', () => {
    it('should handle path directives', () => {
      expect(handler.canHandle('@path')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('@text')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store path variable', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test',
          value: '$HOMEPATH/test'
        },
        location: { start: 0, end: 0 }
      };

      handler.handle(node, state);
      expect(state.getPathVar('test')).toBe('/Users/test/test');
    });

    it('should handle array values', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test',
          value: ['$HOMEPATH', '/test']
        },
        location: { start: 0, end: 0 }
      };

      handler.handle(node, state);
      expect(state.getPathVar('test')).toBe('/Users/test/test');
    });

    it('should handle $~ shorthand', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test',
          value: '$~/test'
        },
        location: { start: 0, end: 0 }
      };

      handler.handle(node, state);
      expect(state.getPathVar('test')).toBe('/Users/test/test');
    });

    it('should handle $PROJECTPATH', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test',
          value: '$PROJECTPATH/test'
        },
        location: { start: 0, end: 0 }
      };

      handler.handle(node, state);
      expect(state.getPathVar('test')).toBe('/project/root/test');
    });

    it('should handle $. shorthand', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test',
          value: '$./test'
        },
        location: { start: 0, end: 0 }
      };

      handler.handle(node, state);
      expect(state.getPathVar('test')).toBe('/project/root/test');
    });

    it('should throw error if name is missing', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          value: '$HOMEPATH/test'
        },
        location: { start: 0, end: 0 }
      };

      expect(() => handler.handle(node, state)).toThrow('Path directive requires a name');
    });

    it('should throw error if value is missing', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test'
        },
        location: { start: 0, end: 0 }
      };

      expect(() => handler.handle(node, state)).toThrow('Path directive requires a value');
    });

    it('should throw error if path does not start with variable', () => {
      const node = {
        type: 'Directive',
        directive: {
          kind: '@path',
          name: 'test',
          value: '/invalid/path'
        },
        location: { start: 0, end: 0 }
      };

      expect(() => handler.handle(node, state)).toThrow('Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.');
    });
  });
}); 