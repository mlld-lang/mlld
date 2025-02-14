import { describe, it, expect, beforeEach } from 'vitest';
import { DirectiveRegistry } from '../directives/registry';
import { textDirectiveHandler } from '../directives/text';
import { dataDirectiveHandler } from '../directives/data';
import { runDirectiveHandler } from '../directives/run';
import { MeldInterpretError } from '../errors/errors';
import { TestContext } from './test-utils';
import { interpret } from '../interpreter';
import type { DirectiveNode } from 'meld-spec';

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
    it('should adjust locations in nested directives', async () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const parentLocation = nestedContext.createLocation(1, 1);
      const childLocation = nestedContext.createLocation(2, 3);

      const parentNode = nestedContext.createDirectiveNode('text', {
        name: 'parent',
        value: 'value'
      }, parentLocation) as DirectiveNode & { children?: DirectiveNode[] };

      // Create a text directive without required data to trigger an error
      const childNode = nestedContext.createDirectiveNode('text', {}, childLocation);

      parentNode.children = [childNode];

      await expect(interpret([parentNode], nestedContext.state, nestedContext.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);

      const error = await interpret([parentNode], nestedContext.state, nestedContext.createHandlerContext())
        .catch(e => e);
      expect(error).toBeInstanceOf(MeldInterpretError);
      if (error instanceof MeldInterpretError) {
        expect(error.location).toBeDefined();
        expect(error.location?.line).toBe(7); // base.line (5) + relative.line (2) - 1
        expect(error.location?.column).toBe(3);
      }
    });
  });

  describe('error handling', () => {
    it('should handle errors in deeply nested directives', async () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);

      const level1Location = nestedContext.createLocation(1, 1);
      const level2Location = nestedContext.createLocation(2, 3);
      const level3Location = nestedContext.createLocation(3, 5);

      const level1 = nestedContext.createDirectiveNode('text', {
        name: 'level1',
        value: 'value1'
      }, level1Location) as DirectiveNode & { children?: DirectiveNode[] };

      const level2 = nestedContext.createDirectiveNode('text', {
        name: 'level2',
        value: 'value2'
      }, level2Location) as DirectiveNode & { children?: DirectiveNode[] };

      // Create a text directive without required data to trigger an error
      const level3 = nestedContext.createDirectiveNode('text', {}, level3Location);

      level2.children = [level3];
      level1.children = [level2];

      await expect(interpret([level1], nestedContext.state, nestedContext.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);

      const error = await interpret([level1], nestedContext.state, nestedContext.createHandlerContext())
        .catch(e => e);
      expect(error).toBeInstanceOf(MeldInterpretError);
      if (error instanceof MeldInterpretError) {
        expect(error.location).toBeDefined();
        expect(error.location?.line).toBe(8); // base.line (5) + relative.line (3) - 1
        expect(error.location?.column).toBe(5);
      }
    });
  });
}); 