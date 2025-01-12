import { DirectiveHandler, DirectiveRegistry } from '../index';
import { InterpreterState } from '../../state/state';
import type { DirectiveNode, DirectiveKind } from 'meld-ast';

describe('DirectiveRegistry', () => {
  let registry: DirectiveRegistry;

  beforeEach(() => {
    registry = new DirectiveRegistry();
  });

  describe('registration', () => {
    it('should register and find handlers', () => {
      const mockHandler: DirectiveHandler = {
        canHandle: (kind: DirectiveKind) => kind === 'run',
        handle: jest.fn()
      };

      registry.register(mockHandler);
      const found = registry.findHandler('run');

      expect(found).toBe(mockHandler);
    });

    it('should return undefined for unknown directive kinds', () => {
      const found = registry.findHandler('run');
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

      registry.register(handler1);
      registry.register(handler2);

      expect(registry.findHandler('run')).toBe(handler1);
      expect(registry.findHandler('import')).toBe(handler2);
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

      registry.register(mockHandler);
      const handler = registry.findHandler('run');
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

      registry.register(mockHandler);
      registry.clear();

      expect(registry.findHandler('run')).toBeUndefined();
    });
  });
}); 