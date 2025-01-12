import { textDirectiveHandler } from '../text';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode } from 'meld-spec';

describe('TextDirectiveHandler', () => {
  let handler = textDirectiveHandler;
  let state: InterpreterState;

  beforeEach(() => {
    state = new InterpreterState();
  });

  describe('canHandle', () => {
    it('should handle text directives', () => {
      expect(handler.canHandle('@text')).toBe(true);
    });

    it('should not handle other directives', () => {
      expect(handler.canHandle('@data')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should store simple text value in state', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'message',
          value: 'Hello World'
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('message')).toBe('Hello World');
    });

    it('should handle string concatenation with array values', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'message',
          value: ['Hello', ' ', 'World']
        }
      };

      handler.handle(node, state);
      expect(state.getTextVar('message')).toBe('Hello World');
    });

    it('should throw error if name is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          value: 'test'
        } as any
      };

      expect(() => handler.handle(node, state)).toThrow('Text directive requires a name');
    });

    it('should throw error if value is missing', () => {
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: '@text',
          name: 'test'
        } as any
      };

      expect(() => handler.handle(node, state)).toThrow('Text directive requires a value');
    });
  });
}); 