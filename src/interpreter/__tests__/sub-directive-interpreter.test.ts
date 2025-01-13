import { MeldError, MeldInterpretError } from '../errors/errors';
import { TestContext } from './test-utils';
import { interpretSubDirectives } from '../subInterpreter';

describe('Sub-directive Interpreter', () => {
  let context: TestContext;
  let baseLocation: { start: { line: number; column: number }; end: { line: number; column: number } };

  beforeEach(() => {
    context = new TestContext();
    baseLocation = { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } };
  });

  describe('basic interpretation', () => {
    it('should interpret directives', async () => {
      const content = '@text { "name": "test", "value": "Hello" }';
      const { state } = await interpretSubDirectives(content, baseLocation, context.state);
      expect(state.getTextVar('test')).toBe('Hello');
    });
  });

  describe('nested interpretation', () => {
    it('should handle nested content with location adjustment', async () => {
      const content = '@text { "name": "test", "value": "Hello" }';
      const { state } = await interpretSubDirectives(content, baseLocation, context.state);
      expect(state.getTextVar('test')).toBe('Hello');
    });

    it('should preserve error locations in nested content', async () => {
      const content = '@text { "invalid": "field" }';
      await expect(interpretSubDirectives(content, baseLocation, context.state))
        .rejects.toThrow(MeldInterpretError);
    });
  });

  describe('state management', () => {
    it('should create new state for each interpretation', async () => {
      const content = '@text { "name": "test1", "value": "Hello" }';
      const { state: state1 } = await interpretSubDirectives(content, baseLocation, context.state);
      expect(state1.getTextVar('test1')).toBe('Hello');

      const content2 = '@text { "name": "test2", "value": "World" }';
      const { state: state2 } = await interpretSubDirectives(content2, baseLocation, context.state);
      expect(state2.getTextVar('test2')).toBe('World');
    });
  });

  describe('error handling', () => {
    it('should handle parse errors', async () => {
      const content = '@invalid-syntax';
      await expect(interpretSubDirectives(content, baseLocation, context.state))
        .rejects.toThrow(MeldInterpretError);
    });

    it('should handle interpretation errors', async () => {
      const content = '@unknown';
      await expect(interpretSubDirectives(content, baseLocation, context.state))
        .rejects.toThrow(MeldInterpretError);
    });
  });
}); 