import { describe, it, expect } from 'vitest';
import { interpretSubDirectives } from '../subInterpreter';
import { TestContext } from './test-utils';
import { DirectiveRegistry } from '../directives/registry';
import { dataDirectiveHandler } from '../directives/data';
import { MeldInterpretError } from '../errors/errors';

describe('Sub-directive Interpreter', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(dataDirectiveHandler);
  });

  describe('basic interpretation', () => {
    it('should interpret text content', () => {
      const baseLocation = context.createLocation(1, 1);
      const result = interpretSubDirectives('Hello world', baseLocation, context.state);
      const nodes = result.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('Hello world');
    });

    it('should interpret directives', () => {
      const baseLocation = context.createLocation(1, 1);
      const result = interpretSubDirectives('@data name="test" value="value"', baseLocation, context.state);
      expect(result.getDataVar('test')).toBe('value');
    });
  });

  describe('nested interpretation', () => {
    it('should handle nested content with location adjustment', () => {
      const baseLocation = context.createLocation(5, 3);

      const content = `
Hello world
@data name="test" value="nested"
      `;

      const result = interpretSubDirectives(content, baseLocation, context.state);

      const nodes = result.getNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes[0].location?.start.line).toBe(6); // base.line (5) + relative.line (2) - 1
      expect(nodes[1].location?.start.line).toBe(7); // base.line (5) + relative.line (3) - 1
    });

    it('should preserve error locations in nested content', () => {
      const baseLocation = context.createLocation(5, 3);

      try {
        interpretSubDirectives('@unknown', baseLocation, context.state);
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
      const baseLocation = context.createLocation(1, 1);
      const state1 = interpretSubDirectives('@data name="test1" value="value1"', baseLocation, context.state);
      const state2 = interpretSubDirectives('@data name="test2" value="value2"', baseLocation, context.state);

      expect(state1.getDataVar('test1')).toBe('value1');
      expect(state1.getDataVar('test2')).toBeUndefined();
      expect(state2.getDataVar('test1')).toBeUndefined();
      expect(state2.getDataVar('test2')).toBe('value2');
    });

    it('should inherit parent state when specified', () => {
      const baseLocation = context.createLocation(1, 1);
      context.state.setDataVar('parent', 'value');
      const childState = interpretSubDirectives('Hello', baseLocation, context.state);

      expect(childState.getDataVar('parent')).toBe('value');
    });
  });

  describe('error handling', () => {
    it('should handle parse errors', () => {
      const baseLocation = context.createLocation(1, 1);
      expect(() => 
        interpretSubDirectives('@invalid-syntax', baseLocation, context.state)
      ).toThrow(MeldInterpretError);
    });

    it('should handle interpretation errors', () => {
      const baseLocation = context.createLocation(1, 1);
      expect(() =>
        interpretSubDirectives('@unknown', baseLocation, context.state)
      ).toThrow(MeldInterpretError);
    });
  });
}); 