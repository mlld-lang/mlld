import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '../interpreter.js';
import { InterpreterState } from '../state/state.js';
import { DirectiveRegistry } from '../directives/registry.js';
import { DataDirectiveHandler } from '../directives/data.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode } from 'meld-spec';
import { MeldInterpretError } from '../errors/errors.js';

describe('interpret', () => {
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
    DirectiveRegistry.clear();
  });

  describe('text nodes', () => {
    it('should handle text nodes', () => {
      const nodes: TextNode[] = [
        {
          type: 'Text' as const,
          content: 'Hello, world!',
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 13 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getNodes()).toEqual(nodes);
    });
  });

  describe('comment nodes', () => {
    it('should handle comment nodes as text nodes', () => {
      const nodes: TextNode[] = [
        {
          type: 'Text' as const,
          content: 'This is a comment',
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 13 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getNodes()).toEqual(nodes);
    });
  });

  describe('code fence nodes', () => {
    it('should handle code fence nodes with language', () => {
      const nodes: CodeFenceNode[] = [
        {
          type: 'CodeFence' as const,
          language: 'javascript',
          content: 'console.log("Hello");',
          location: { start: { line: 1, column: 1 }, end: { line: 3, column: 3 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getNodes()).toEqual(nodes);
    });

    it('should handle code fence nodes without language', () => {
      const nodes: CodeFenceNode[] = [
        {
          type: 'CodeFence' as const,
          content: 'Some code',
          location: { start: { line: 1, column: 1 }, end: { line: 3, column: 3 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getNodes()).toEqual(nodes);
    });
  });

  describe('directive nodes', () => {
    it('should handle directive nodes with registered handlers', () => {
      DirectiveRegistry.registerHandler(new DataDirectiveHandler());

      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'data',
            identifier: 'test',
            value: { key: 'value' }
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getDataVar('test')).toEqual({ key: 'value' });
    });

    it('should throw error for unhandled directive kinds', () => {
      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'run',
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      expect(() => interpret(nodes, state)).toThrow(
        'No handler found for directive: run'
      );
    });
  });

  describe('unknown nodes', () => {
    it('should store unknown node types in state', () => {
      const nodes: TextNode[] = [
        {
          type: 'Text' as const,
          content: 'Some text',
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getNodes()).toEqual(nodes);
    });
  });

  describe('error handling', () => {
    it('should wrap and rethrow errors with node context', () => {
      DirectiveRegistry.registerHandler({
        canHandle: () => true,
        handle: () => {
          throw new Error('Test error');
        }
      });

      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'data'
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      expect(() => interpret(nodes, state)).toThrow(
        'Failed to interpret node Directive: Test error'
      );
    });

    it('should handle non-Error errors', () => {
      DirectiveRegistry.registerHandler({
        canHandle: () => true,
        handle: () => {
          throw 'String error';
        }
      });

      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'data'
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      expect(() => interpret(nodes, state)).toThrow(
        'Failed to interpret node Directive: String error'
      );
    });
  });

  describe('data directive', () => {
    beforeEach(() => {
      DirectiveRegistry.registerHandler(new DataDirectiveHandler());
    });

    it('should handle data directive with object literal', () => {
      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'data',
            identifier: 'test',
            value: { key: 'value' }
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getDataVar('test')).toEqual({ key: 'value' });
    });

    it('should handle data directive with array literal', () => {
      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'data',
            identifier: 'test',
            value: [1, 2, 3]
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getDataVar('test')).toEqual([1, 2, 3]);
    });

    it('should handle data directive with string literal', () => {
      const nodes: DirectiveNode[] = [
        {
          type: 'Directive' as const,
          directive: {
            kind: 'data',
            identifier: 'test',
            value: 'hello'
          },
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      ];

      interpret(nodes, state);
      expect(state.getDataVar('test')).toBe('hello');
    });
  });
}); 