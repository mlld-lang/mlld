import { TestContext, createTestDirective, createTestLocation, createTestState } from './test-utils';
import { MeldError, MeldDirectiveError } from '../errors/errors';
import { ErrorFactory } from '../errors/factory';
import { createLocation } from './test-utils';

describe('Test Infrastructure', () => {
  describe('TestContext', () => {
    it('should create a basic test context', () => {
      const context = new TestContext();
      expect(context.state).toBeDefined();
      expect(context.mode).toBe('toplevel');
      expect(context.parentState).toBeUndefined();
      expect(context.baseLocation).toBeUndefined();
    });

    it('should create a nested test context', () => {
      const parent = new TestContext();
      const baseLocation = { start: { line: 5, column: 3 }, end: { line: 10, column: 1 } };
      const nested = parent.createNestedContext(baseLocation);

      expect(nested.mode).toBe('rightside');
      expect(nested.parentState).toBe(parent.state);
      expect(nested.baseLocation).toBe(baseLocation);
    });

    it('should create handler context with correct properties', () => {
      const context = new TestContext({
        mode: 'rightside',
        baseLocation: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }
      });

      const handlerContext = context.createHandlerContext();
      expect(handlerContext.mode).toBe('rightside');
      expect(handlerContext.baseLocation).toBeDefined();
      expect(handlerContext.parentState).toBeUndefined();
    });

    it('should adjust locations in right-side mode', () => {
      const context = new TestContext({
        mode: 'rightside',
        baseLocation: { start: { line: 5, column: 3 }, end: { line: 10, column: 1 } }
      });

      const location = context.createLocation(2, 4);
      const adjusted = context.adjustLocation(location);

      expect(adjusted.start.line).toBe(6); // base.line (5) + relative.line (2) - 1
      expect(adjusted.start.column).toBe(4); // relative.column (since line > 1)
    });

    it('should create directive nodes with locations', () => {
      const context = new TestContext();
      const location = context.createLocation(1, 1);
      const node = context.createDirectiveNode('test', { name: 'test', value: 'value' }, location);

      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('test');
      expect(node.location).toBe(location);
    });

    it('should create text nodes with locations', () => {
      const context = new TestContext();
      const location = context.createLocation(1, 1);
      const node = context.createTextNode('test content', location);

      expect(node.type).toBe('Text');
      expect(node.content).toBe('test content');
      expect(node.location).toBe(location);
    });

    it('should create a nested test context with parent state', () => {
      const parent = new TestContext();
      const child = parent.createNestedContext(createLocation(1, 1));
      expect(child.state.parentState).toBe(parent.state);
    });
  });

  describe('Test Utilities', () => {
    it('should create test directives with defaults', () => {
      const directive = createTestDirective('test', { name: 'test' });
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('test');
      expect(directive.directive.name).toBe('test');
    });

    it('should create test locations with defaults', () => {
      const location = createTestLocation();
      expect(location.start.line).toBe(1);
      expect(location.start.column).toBe(1);
      expect(location.end).toBeDefined();
    });

    it('should create test state with parent', () => {
      const parent = createTestState();
      const child = createTestState({ parentState: parent });
      expect(child.parentState).toBe(parent);
    });

    it('should create test state with file path', () => {
      const state = createTestState({ filePath: '/test/file.meld' });
      expect(state.getCurrentFilePath()).toBe('/test/file.meld');
    });
  });

  describe('Error Handling', () => {
    it('should preserve error locations in nested contexts', () => {
      const parent = new TestContext();
      const child = parent.createNestedContext(createLocation(1, 1));
      const error = new MeldDirectiveError('test error', createLocation(2, 2), 'text');
      expect(() => {
        throw error;
      }).toThrow(MeldDirectiveError);
    });
  });
}); 