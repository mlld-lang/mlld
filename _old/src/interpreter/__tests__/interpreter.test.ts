import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '../interpreter.js';
import { DirectiveRegistry } from '../directives/registry.js';
import { DataDirectiveHandler } from '../directives/data.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode } from 'meld-spec';
import { MeldInterpretError } from '../errors/errors.js';
import { TestContext, createTestDirective } from './test-utils';
import { MeldError } from '../errors/errors';

describe('interpret', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
  });

  describe('text nodes', () => {
    it('should handle text nodes', async () => {
      const nodes: TextNode[] = [
        context.createTextNode('Hello world', context.createLocation(1, 1))
      ];

      await interpret(nodes, context.state, context.createHandlerContext());
      expect(context.state.getNodes()).toHaveLength(1);
      expect(context.state.getNodes()[0].type).toBe('Text');
      expect(context.state.getNodes()[0].content).toBe('Hello world');
    });
  });

  describe('directive nodes', () => {
    it('should handle data directives', async () => {
      DirectiveRegistry.registerHandler(new DataDirectiveHandler());
      const location = context.createLocation(1, 1);
      const nodes: DirectiveNode[] = [
        context.createDirectiveNode('data', { name: 'test', value: 'value' }, location)
      ];

      await interpret(nodes, context.state, context.createHandlerContext());
      expect(context.state.getDataVar('test')).toBe('value');
    });

    it('should throw on unknown directives', async () => {
      const location = context.createLocation(1, 1);
      const nodes: DirectiveNode[] = [
        context.createDirectiveNode('unknown', { name: 'test' }, location)
      ];

      await expect(() => interpret(nodes, context.state, context.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });
  });

  describe('code fence nodes', () => {
    it('should handle code fence nodes', async () => {
      const location = context.createLocation(1, 1);
      const nodes: CodeFenceNode[] = [{
        type: 'CodeFence',
        language: 'javascript',
        content: 'console.log("test")',
        location
      }];

      await interpret(nodes, context.state, context.createHandlerContext());
      expect(context.state.getNodes()).toHaveLength(1);
      expect(context.state.getNodes()[0].type).toBe('CodeFence');
    });
  });

  describe('nested interpretation', () => {
    it('should handle nested states correctly', async () => {
      const parentLocation = context.createLocation(1, 1);
      const childLocation = context.createLocation(2, 3);
      
      DirectiveRegistry.registerHandler(new DataDirectiveHandler());
      
      // Create parent nodes
      const parentNodes: MeldNode[] = [
        context.createDirectiveNode('data', { name: 'parent', value: 'parent-value' }, parentLocation)
      ];

      // Create child context and nodes
      const childContext = context.createNestedContext(parentLocation);
      const childNodes: MeldNode[] = [
        childContext.createDirectiveNode('data', { name: 'child', value: 'child-value' }, childLocation)
      ];

      // Interpret both
      await interpret(parentNodes, context.state, context.createHandlerContext());
      await interpret(childNodes, childContext.state, childContext.createHandlerContext());
      childContext.state.mergeIntoParent();

      // Verify results
      expect(context.state.getDataVar('parent')).toBe('parent-value');
      expect(context.state.getDataVar('child')).toBe('child-value');
    });
  });

  describe('error handling', () => {
    it('should preserve error locations', async () => {
      const location = context.createLocation(5, 3);
      const nodes: DirectiveNode[] = [
        context.createDirectiveNode('unknown', { name: 'test' }, location)
      ];

      await expect(() => interpret(nodes, context.state, context.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });

    it('should handle errors in nested contexts', async () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const nestedLocation = nestedContext.createLocation(2, 4);
      
      const nodes: DirectiveNode[] = [
        nestedContext.createDirectiveNode('unknown', { name: 'test' }, nestedLocation)
      ];

      await expect(() => interpret(nodes, nestedContext.state, nestedContext.createHandlerContext()))
        .rejects.toThrow(MeldInterpretError);
    });
  });
}); 