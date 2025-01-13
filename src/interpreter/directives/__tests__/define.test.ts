import { defineDirectiveHandler } from '../define';
import { TestContext } from '../../__tests__/test-utils';
import { MeldError } from '../../errors/errors';

describe('DefineDirectiveHandler', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
  });

  describe('basic command definition', () => {
    it('should define simple commands', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('define', {
        name: 'test',
        value: () => 'test result'
      }, location);

      defineDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const command = context.state.getCommand('test');
      expect(command).toBeDefined();
      expect(command?.()).toBe('test result');
    });

    it('should handle commands with arguments', () => {
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('define', {
        name: 'greet',
        value: (name: string) => `Hello, ${name}!`
      }, location);

      defineDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const command = context.state.getCommand('greet');
      expect(command).toBeDefined();
      expect(command?.('world')).toBe('Hello, world!');
    });
  });

  describe('error handling', () => {
    it('should throw error for missing name', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('define', {
        value: () => 'test'
      }, location);

      expect(() => 
        defineDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });

    it('should throw error for missing function', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('define', {
        name: 'test'
      }, location);

      expect(() => 
        defineDirectiveHandler.handle(node, context.state, context.createHandlerContext())
      ).toThrow(MeldError);
    });

    it('should preserve error locations in right-side mode', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const defineLocation = nestedContext.createLocation(2, 4);

      const node = nestedContext.createDirectiveNode('define', {
        name: 'test'
      }, defineLocation);

      try {
        defineDirectiveHandler.handle(node, nestedContext.state, nestedContext.createHandlerContext());
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

  describe('command scoping', () => {
    it('should handle command shadowing', () => {
      const location1 = context.createLocation(1, 1);
      const location2 = context.createLocation(2, 1);

      const node1 = context.createDirectiveNode('define', {
        name: 'test',
        value: () => 'original'
      }, location1);

      const node2 = context.createDirectiveNode('define', {
        name: 'test',
        value: () => 'shadowed'
      }, location2);

      defineDirectiveHandler.handle(node1, context.state, context.createHandlerContext());
      defineDirectiveHandler.handle(node2, context.state, context.createHandlerContext());

      const command = context.state.getCommand('test');
      expect(command?.()).toBe('shadowed');
    });

    it('should handle nested scopes', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const parentNode = context.createDirectiveNode('define', {
        name: 'test',
        value: () => 'parent'
      }, context.createLocation(1, 1));

      const childNode = nestedContext.createDirectiveNode('define', {
        name: 'test',
        value: () => 'child'
      }, nestedContext.createLocation(2, 4));

      defineDirectiveHandler.handle(parentNode, context.state, context.createHandlerContext());
      defineDirectiveHandler.handle(childNode, nestedContext.state, nestedContext.createHandlerContext());

      expect(context.state.getCommand('test')?.()).toBe('parent');
      expect(nestedContext.state.getCommand('test')?.()).toBe('child');
    });
  });

  describe('command execution', () => {
    it('should handle command errors', () => {
      const location = context.createLocation(5, 3);
      const node = context.createDirectiveNode('define', {
        name: 'error',
        value: () => { throw new Error('Command error'); }
      }, location);

      defineDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const command = context.state.getCommand('error');
      expect(command).toBeDefined();
      expect(() => command?.()).toThrow('Command error');
    });

    it('should preserve this context in commands', () => {
      const location = context.createLocation(1, 1);
      const obj = { value: 'test' };
      const node = context.createDirectiveNode('define', {
        name: 'getValue',
        value: function(this: typeof obj) { return this.value; }
      }, location);

      defineDirectiveHandler.handle(node, context.state, context.createHandlerContext());

      const command = context.state.getCommand('getValue');
      expect(command?.call(obj)).toBe('test');
    });
  });
}); 