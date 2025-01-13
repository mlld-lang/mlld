import { describe, it, expect } from 'vitest';
import { SubInterpreter } from '../subInterpreter.js';
import { TestContext } from './test-utils';
import { DirectiveRegistry } from '../directives/registry.js';
import { DataDirectiveHandler } from '../directives/data.js';
import { MeldInterpretError } from '../errors/errors.js';

describe('SubInterpreter', () => {
  let context: TestContext;
  let subInterpreter: SubInterpreter;

  beforeEach(() => {
    context = new TestContext();
    subInterpreter = new SubInterpreter();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(new DataDirectiveHandler());
  });

  describe('basic interpretation', () => {
    it('should interpret text content', () => {
      const result = subInterpreter.interpret('Hello world', context.state);
      expect(result.getNodes()).toHaveLength(1);
      expect(result.getNodes()[0].type).toBe('Text');
      expect(result.getNodes()[0].content).toBe('Hello world');
    });

    it('should interpret directives', () => {
      const result = subInterpreter.interpret('@data name="test" value="value"', context.state);
      expect(result.getDataVar('test')).toBe('value');
    });
  });

  describe('nested interpretation', () => {
    it('should handle nested content with location adjustment', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const content = `
Hello world
@data name="test" value="nested"
      `;

      const result = subInterpreter.interpret(content, nestedContext.state, {
        mode: 'rightside',
        baseLocation
      });

      const nodes = result.getNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes[0].location?.start.line).toBe(6); // base.line (5) + relative.line (2) - 1
      expect(nodes[1].location?.start.line).toBe(7); // base.line (5) + relative.line (3) - 1
    });

    it('should preserve error locations in nested content', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      try {
        subInterpreter.interpret('@unknown', nestedContext.state, {
          mode: 'rightside',
          baseLocation
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpretError);
        if (error instanceof MeldInterpretError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(5); // Adjusted to base location
          expect(error.location?.column).toBe(3);
        }
      }
    });
  });

  describe('state management', () => {
    it('should create new state for each interpretation', () => {
      const state1 = subInterpreter.interpret('@data name="test1" value="value1"', context.state);
      const state2 = subInterpreter.interpret('@data name="test2" value="value2"', context.state);

      expect(state1.getDataVar('test1')).toBe('value1');
      expect(state1.getDataVar('test2')).toBeUndefined();
      expect(state2.getDataVar('test1')).toBeUndefined();
      expect(state2.getDataVar('test2')).toBe('value2');
    });

    it('should inherit parent state when specified', () => {
      context.state.setDataVar('parent', 'value');
      const childState = subInterpreter.interpret('Hello', context.state);

      expect(childState.getDataVar('parent')).toBe('value');
    });
  });

  describe('error handling', () => {
    it('should handle parse errors', () => {
      expect(() => 
        subInterpreter.interpret('@invalid-syntax', context.state)
      ).toThrow(MeldInterpretError);
    });

    it('should handle interpretation errors', () => {
      expect(() =>
        subInterpreter.interpret('@unknown', context.state)
      ).toThrow(MeldInterpretError);
    });
  });
}); 