import { DirectiveRegistry } from '../registry.js';
import { DirectiveHandler } from '../types.js';
import { InterpreterState } from '../../state/state.js';
import type { DirectiveNode, DirectiveKind } from 'meld-spec';

describe('DirectiveRegistry', () => {
  beforeEach(() => {
    DirectiveRegistry.clear();
  });

  describe('registration', () => {
    it('should register and find handlers', () => {
      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === 'run',
        handle: jest.fn()
      };

      DirectiveRegistry.registerHandler(mockHandler);
      const found = DirectiveRegistry.findHandler('run');

      expect(found).toBe(mockHandler);
    });

    it('should return undefined for unknown directive kinds', () => {
      const found = DirectiveRegistry.findHandler('run');
      expect(found).toBeUndefined();
    });

    it('should find the correct handler when multiple are registered', () => {
      const handler1: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === 'run',
        handle: jest.fn()
      };

      const handler2: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === 'import',
        handle: jest.fn()
      };

      DirectiveRegistry.registerHandler(handler1);
      DirectiveRegistry.registerHandler(handler2);

      expect(DirectiveRegistry.findHandler('run')).toBe(handler1);
      expect(DirectiveRegistry.findHandler('import')).toBe(handler2);
    });
  });

  describe('handler execution', () => {
    it('should properly execute handlers with state', () => {
      const state = new InterpreterState();
      const mockNode: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'run',
          command: 'echo "test"'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === 'run',
        handle: jest.fn()
      };

      DirectiveRegistry.registerHandler(mockHandler);
      const handler = DirectiveRegistry.findHandler('run');
      handler?.handle(mockNode, state);

      expect(mockHandler.handle).toHaveBeenCalledWith(mockNode, state);
    });
  });

  describe('clear', () => {
    it('should remove all registered handlers', () => {
      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === 'run',
        handle: jest.fn()
      };

      DirectiveRegistry.registerHandler(mockHandler);
      DirectiveRegistry.clear();

      expect(DirectiveRegistry.findHandler('run')).toBeUndefined();
    });
  });
}); 