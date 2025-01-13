import { describe, it, expect, beforeEach } from 'vitest';
import { DirectiveRegistry } from '../directives/registry';
import { textDirectiveHandler } from '../directives/text';
import { dataDirectiveHandler } from '../directives/data';
import { runDirectiveHandler } from '../directives/run';
import { MeldInterpretError } from '../errors/errors';
import { TestContext } from './test-utils';
import { interpret } from '../interpreter';

describe('Location Adjustment', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(textDirectiveHandler);
    DirectiveRegistry.registerHandler(dataDirectiveHandler);
    DirectiveRegistry.registerHandler(runDirectiveHandler);
  });

  describe('location handling', () => {
    it('should adjust locations in nested directives', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const parentLocation = nestedContext.createLocation(1, 1);
      const childLocation = nestedContext.createLocation(2, 3);

      const parentNode = nestedContext.createDirectiveNode('text', {
        name: 'parent',
        value: 'value'
      }, parentLocation);

      const childNode = nestedContext.createDirectiveNode('text', {
        name: 'child',
        value: 'value'
      }, childLocation);

      parentNode.children = [childNode];

      try {
        // Force an error by using an invalid directive
        childNode.directive.kind = 'invalid';
        interpret([parentNode], nestedContext.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpretError);
        if (error instanceof MeldInterpretError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(7); // base.line (5) + relative.line (2) - 1
          expect(error.location?.column).toBe(3);
        }
      }
    });
  });

  describe('error handling', () => {
    it('should handle errors in deeply nested directives', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const level1Location = nestedContext.createLocation(1, 1);
      const level2Location = nestedContext.createLocation(2, 3);
      const level3Location = nestedContext.createLocation(3, 5);

      const level1 = nestedContext.createDirectiveNode('text', {
        name: 'level1',
        value: 'value1'
      }, level1Location);

      const level2 = nestedContext.createDirectiveNode('text', {
        name: 'level2',
        value: 'value2'
      }, level2Location);

      const level3 = nestedContext.createDirectiveNode('invalid', {
        name: 'level3'
      }, level3Location);

      level2.children = [level3];
      level1.children = [level2];

      try {
        interpret([level1], nestedContext.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpretError);
        if (error instanceof MeldInterpretError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(8); // base.line (5) + relative.line (3) - 1
          expect(error.location?.column).toBe(5);
        }
      }
    });
  });
}); 