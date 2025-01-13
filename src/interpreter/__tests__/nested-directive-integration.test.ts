import { describe, it, expect, beforeEach } from 'vitest';
import { DirectiveRegistry } from '../directives/registry';
import { textDirectiveHandler } from '../directives/text';
import { dataDirectiveHandler } from '../directives/data';
import { runDirectiveHandler } from '../directives/run';
import { TestContext } from './test-utils';
import { interpret } from '../interpreter';

describe('Nested Directives Integration', () => {
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
}); 