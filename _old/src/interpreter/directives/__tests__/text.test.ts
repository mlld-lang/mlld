import { textDirectiveHandler } from '../text';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';
import { ErrorFactory } from '../../errors/factory';

describe('TextDirectiveHandler', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
  });

  describe('basic text handling', () => {
    it('should handle simple text content', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('text', {
        name: 'test',
        value: 'Hello world'
      }, location);

      await textDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getTextVar('test')).toBe('Hello world');
    });

    it('should handle empty text content', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('text', {
        name: 'test',
        value: ''
      }, location);

      await textDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getTextVar('test')).toBe('');
    });

    it('should handle undefined/null values', async () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('text', {
        name: 'test',
        value: undefined
      }, location);

      await textDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      expect(context.state.getTextVar('test')).toBe('');
    });
  });

  describe('error handling', () => {
    it('should throw error for missing name', async () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('text', {
        value: 'test'
      }, location);

      await expect(
        textDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).rejects.toThrow('Text directive requires a name parameter');
    });

    it('should preserve error locations in right-side mode', async () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const textLocation = nestedContext.createLocation(2, 4);
      const node = context.createDirectiveNode('text', {
        value: 'test'
      }, textLocation);

      try {
        await textDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldError);
        if (error instanceof MeldError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(6); // base.line (5) + relative.line (2) - 1
          expect(error.location?.column).toBe(4);
        }
      }
    });
  });

  describe('nested text handling', () => {
    it('should handle text in nested contexts', async () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const textLocation = nestedContext.createLocation(2, 4);
      const node = context.createDirectiveNode('text', {
        name: 'test',
        value: 'nested text'
      }, textLocation);

      await textDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());

      expect(nestedContext.state.getTextVar('test')).toBe('nested text');
    });

    it('should preserve parent context text variables', async () => {
      const parentNode = context.createDirectiveNode('text', {
        name: 'parent',
        value: 'parent text'
      }, context.createLocation(1, 1));

      const nestedContext = context.createNestedContext(context.createLocation(5, 3));
      const childNode = context.createDirectiveNode('text', {
        name: 'child',
        value: 'child text'
      }, nestedContext.createLocation(2, 4));

      await textDirectiveHandler.handle(parentNode, context.state, context.createHandlerContext());
      await textDirectiveHandler.handle(childNode, nestedContext.state, nestedContext.createHandlerContext());

      expect(context.state.getTextVar('parent')).toBe('parent text');
      expect(nestedContext.state.getTextVar('child')).toBe('child text');
    });
  });
}); 