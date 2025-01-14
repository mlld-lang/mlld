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
        readonly directiveKind = 'run';
        canHandle(kind: string, mode: string) { return kind === 'run'; }
        async handle() { return Promise.resolve(); }
      }
      const mockHandler = new MockHandler();

      DirectiveRegistry.registerHandler(mockHandler);
      const handler = DirectiveRegistry.findHandler('run', 'toplevel');
      expect(handler).toBe(mockHandler);
    });

    it('should handle multiple handlers', () => {
      class RunHandler implements DirectiveHandler {
        readonly directiveKind = 'run';
        canHandle(kind: string, mode: string) { return kind === 'run'; }
        async handle() { return Promise.resolve(); }
      }

      class TextHandler implements DirectiveHandler {
        readonly directiveKind = 'text';
        canHandle(kind: string, mode: string) { return kind === 'text'; }
        async handle() { return Promise.resolve(); }
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
    it('should execute handlers with correct context', async () => {
      class TestHandler implements DirectiveHandler {
        readonly directiveKind = 'test';
        canHandle(kind: string, mode: string) { return kind === 'test'; }
        handle = vi.fn().mockResolvedValue(undefined);
      }
      const mockHandler = new TestHandler();

      DirectiveRegistry.registerHandler(mockHandler);

      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('test', {
        name: 'test',
        value: 'value'
      }, location);

      const handlerContext = context.createHandlerContext();
      await DirectiveRegistry.handle(node, context.state, handlerContext);

      expect(mockHandler.handle).toHaveBeenCalledWith(node, context.state, handlerContext);
    });

    it('should handle right-side mode correctly', async () => {
      class TestHandler implements DirectiveHandler {
        readonly directiveKind = 'test';
        canHandle(kind: string, mode: string) { return kind === 'test'; }
        handle = vi.fn().mockResolvedValue(undefined);
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
      await DirectiveRegistry.handle(node, nestedContext.state, handlerContext);

      expect(mockHandler.handle).toHaveBeenCalledWith(node, nestedContext.state, handlerContext);
    });
  });

  describe('error handling', () => {
    it('should handle missing handlers gracefully', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('unknown', {
        name: 'test'
      }, location);

      await expect(DirectiveRegistry.handle(node, context.state, context.createHandlerContext()))
        .rejects.toThrow('No handler found for directive kind: unknown');
    });

    it('should preserve error locations from handlers', async () => {
      class ErrorHandler implements DirectiveHandler {
        readonly directiveKind = 'error';
        canHandle(kind: string, mode: string) { return kind === 'error'; }
        async handle() {
          throw new MeldError('Test error');
        }
      }
      const errorHandler = new ErrorHandler();

      DirectiveRegistry.registerHandler(errorHandler);

      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const location = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('error', {
        name: 'test'
      }, location);

      await expect(DirectiveRegistry.handle(node, nestedContext.state, nestedContext.createHandlerContext()))
        .rejects.toThrow('Test error');
    });
  });
}); 