import { TextDirectiveHandler } from '../text.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode } from 'meld-spec';

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    handler = new TextDirectiveHandler();
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('should handle text directives', () => {
      expect(handler.canHandle('text')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('run')).toBe(false);
      expect(handler.canHandle('data')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store simple text value in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: 'Hello World'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('greeting')).toBe('Hello World');
    });

    it('should handle string concatenation with array values', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'message',
          value: ['Hello', ' ', 'World']  // Simulates ++ operator
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('message')).toBe('Hello World');
    });

    it('should throw error if identifier is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          value: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Text directive requires an identifier'
      );
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test'
        } as any,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      expect(() => handler.handle(node, state)).toThrow(
        'Text directive requires a value'
      );
    });
  });
}); 