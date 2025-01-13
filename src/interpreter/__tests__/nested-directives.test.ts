import { describe, it, expect, beforeEach } from 'vitest';
import { DirectiveRegistry } from '../directives/registry';
import { textDirectiveHandler } from '../directives/text';
import { dataDirectiveHandler } from '../directives/data';
import { runDirectiveHandler } from '../directives/run';
import { MeldInterpretError } from '../errors/errors';
import { TestContext } from './test-utils';
import { interpret } from '../interpreter';

describe('Nested Directives', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
    DirectiveRegistry.registerHandler(textDirectiveHandler);
    DirectiveRegistry.registerHandler(dataDirectiveHandler);
    DirectiveRegistry.registerHandler(runDirectiveHandler);
  });

  describe('basic nesting', () => {
    it('should handle simple nested directives', () => {
      const parentLocation = context.createLocation(1, 1);
      const childLocation = context.createLocation(2, 3);

      const parentNode = context.createDirectiveNode('text', {
        name: 'parent',
        value: 'parent-value'
      }, parentLocation);

      const childNode = context.createDirectiveNode('text', {
        name: 'child',
        value: 'child-value'
      }, childLocation);

      parentNode.children = [childNode];

      interpret([parentNode], context.state);

      expect(context.state.getTextVar('parent')).toBe('parent-value');
      expect(context.state.getTextVar('child')).toBe('child-value');
    });

    it('should handle multiple levels of nesting', () => {
      const level1Location = context.createLocation(1, 1);
      const level2Location = context.createLocation(2, 3);
      const level3Location = context.createLocation(3, 5);

      const level1 = context.createDirectiveNode('text', {
        name: 'level1',
        value: 'value1'
      }, level1Location);

      const level2 = context.createDirectiveNode('text', {
        name: 'level2',
        value: 'value2'
      }, level2Location);

      const level3 = context.createDirectiveNode('text', {
        name: 'level3',
        value: 'value3'
      }, level3Location);

      level2.children = [level3];
      level1.children = [level2];

      interpret([level1], context.state);

      expect(context.state.getTextVar('level1')).toBe('value1');
      expect(context.state.getTextVar('level2')).toBe('value2');
      expect(context.state.getTextVar('level3')).toBe('value3');
    });
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

  describe('state inheritance', () => {
    it('should inherit parent state in nested directives', () => {
      const parentLocation = context.createLocation(1, 1);
      const childLocation = context.createLocation(2, 3);

      context.state.setTextVar('inherited', 'value');

      const parentNode = context.createDirectiveNode('text', {
        name: 'parent',
        value: '{inherited}'
      }, parentLocation);

      const childNode = context.createDirectiveNode('text', {
        name: 'child',
        value: '{inherited}'
      }, childLocation);

      parentNode.children = [childNode];

      interpret([parentNode], context.state);

      expect(context.state.getTextVar('parent')).toBe('value');
      expect(context.state.getTextVar('child')).toBe('value');
    });

    it('should handle variable shadowing in nested scopes', () => {
      const parentLocation = context.createLocation(1, 1);
      const child1Location = context.createLocation(2, 3);
      const child2Location = context.createLocation(3, 3);

      const parentNode = context.createDirectiveNode('text', {
        name: 'shared',
        value: 'parent'
      }, parentLocation);

      const child1 = context.createDirectiveNode('text', {
        name: 'shared',
        value: 'child1'
      }, child1Location);

      const child2 = context.createDirectiveNode('text', {
        name: 'test',
        value: '{shared}'
      }, child2Location);

      child1.children = [child2];
      parentNode.children = [child1];

      interpret([parentNode], context.state);

      expect(context.state.getTextVar('shared')).toBe('child1');
      expect(context.state.getTextVar('test')).toBe('child1');
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