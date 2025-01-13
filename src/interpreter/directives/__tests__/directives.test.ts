import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectiveRegistry } from '../registry';
import { DirectiveHandler } from '../types';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';

describe('DirectiveRegistry', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
  });

  describe('registration', () => {
    it('should register and find handlers', () => {
      class MockHandler implements DirectiveHandler {
        public static readonly directiveKind = 'run';
        canHandle(kind: string) { return kind === 'run'; }
        handle = vi.fn();
      }
      const mockHandler = new MockHandler();

      DirectiveRegistry.registerHandler(mockHandler);
      const handler = DirectiveRegistry.findHandler('run', 'toplevel');
      expect(handler).toBe(mockHandler);
    });

    it('should handle multiple handlers', () => {
      class RunHandler implements DirectiveHandler {
        public static readonly directiveKind = 'run';
        canHandle(kind: string) { return kind === 'run'; }
        handle = vi.fn();
      }

      class TextHandler implements DirectiveHandler {
        public static readonly directiveKind = 'text';
        canHandle(kind: string) { return kind === 'text'; }
        handle = vi.fn();
      }

      const handler1 = new RunHandler();
      const handler2 = new TextHandler();

      DirectiveRegistry.registerHandler(handler1);
      DirectiveRegistry.registerHandler(handler2);

      expect(DirectiveRegistry.findHandler('run', 'toplevel')).toBe(handler1);
      expect(DirectiveRegistry.findHandler('text', 'toplevel')).toBe(handler2);
    });
  });

  describe('handler execution', () => {
    it('should execute handlers with correct context', () => {
      class TestHandler implements DirectiveHandler {
        public static readonly directiveKind = 'test';
        canHandle(kind: string) { return kind === 'test'; }
        handle = vi.fn();
      }
      const mockHandler = new TestHandler();

      DirectiveRegistry.registerHandler(mockHandler);

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('test', {
        name: 'test',
        value: 'value'
      }, location);

      const handlerContext = context.createHandlerContext();
      const handler = DirectiveRegistry.findHandler('test', 'toplevel');
      handler?.handle(node, context.state, handlerContext);

      expect(mockHandler.handle).toHaveBeenCalledWith(node, context.state, handlerContext);
    });

    it('should handle right-side mode correctly', () => {
      class TestHandler implements DirectiveHandler {
        public static readonly directiveKind = 'test';
        canHandle(kind: string) { return kind === 'test'; }
        handle = vi.fn();
      }
      const mockHandler = new TestHandler();

      DirectiveRegistry.registerHandler(mockHandler);

      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const location = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('test', {
        name: 'test',
        value: 'value'
      }, location);

      const handlerContext = nestedContext.createHandlerContext();
      const handler = DirectiveRegistry.findHandler('test', 'rightside');
      handler?.handle(node, nestedContext.state, handlerContext);

      expect(mockHandler.handle).toHaveBeenCalledWith(node, nestedContext.state, handlerContext);
    });
  });

  describe('error handling', () => {
    it('should handle missing handlers gracefully', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('unknown', {
        name: 'test'
      }, location);

      expect(() => {
        const handler = DirectiveRegistry.findHandler('unknown', 'toplevel');
        if (handler) {
          handler.handle(node, context.state, context.createHandlerContext());
        }
      }).not.toThrow();
    });

    it('should preserve error locations from handlers', () => {
      class ErrorHandler implements DirectiveHandler {
        public static readonly directiveKind = 'error';
        canHandle(kind: string) { return kind === 'error'; }
        handle = () => {
          throw new MeldError('Test error');
        };
      }
      const errorHandler = new ErrorHandler();

      DirectiveRegistry.registerHandler(errorHandler);

      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const location = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('error', {
        name: 'test'
      }, location);

      try {
        const handler = DirectiveRegistry.findHandler('error', 'rightside');
        if (handler) {
          handler.handle(node, nestedContext.state, nestedContext.createHandlerContext());
        }
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
      }
    });
  });
}); 