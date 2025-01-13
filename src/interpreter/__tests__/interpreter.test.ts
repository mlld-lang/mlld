import { describe, it, expect, beforeEach } from 'vitest';
import { interpret } from '../interpreter.js';
import { DirectiveRegistry } from '../directives/registry.js';
import { DataDirectiveHandler } from '../directives/data.js';
import type { MeldNode, DirectiveNode, TextNode, CodeFenceNode } from 'meld-spec';
import { MeldInterpretError } from '../errors/errors.js';
import { TestContext, createTestDirective } from './test-utils';

describe('interpret', () => {
  let context: TestContext;

  beforeEach(() => {
    context = new TestContext();
    DirectiveRegistry.clear();
  });

  describe('text nodes', () => {
    it('should handle text nodes', () => {
      const nodes: TextNode[] = [
        context.createTextNode('Hello world', context.createLocation(1, 1))
      ];

      interpret(nodes, context.state);
      expect(context.state.getNodes()).toHaveLength(1);
      expect(context.state.getNodes()[0].type).toBe('Text');
      expect(context.state.getNodes()[0].content).toBe('Hello world');
    });
  });

  describe('directive nodes', () => {
    it('should handle data directives', () => {
      DirectiveRegistry.registerHandler(new DataDirectiveHandler());
      const location = context.createLocation(1, 1);
      const nodes: DirectiveNode[] = [
        context.createDirectiveNode('data', { name: 'test', value: 'value' }, location)
      ];

      interpret(nodes, context.state);
      expect(context.state.getDataVar('test')).toBe('value');
    });

    it('should throw on unknown directives', () => {
      const location = context.createLocation(1, 1);
      const nodes: DirectiveNode[] = [
        context.createDirectiveNode('unknown', { name: 'test' }, location)
      ];

      expect(() => interpret(nodes, context.state)).toThrow(MeldInterpretError);
    });
  });

  describe('code fence nodes', () => {
    it('should handle code fence nodes', () => {
      const location = context.createLocation(1, 1);
      const nodes: CodeFenceNode[] = [{
        type: 'CodeFence',
        language: 'javascript',
        content: 'console.log("test")',
        location
      }];

      interpret(nodes, context.state);
      expect(context.state.getNodes()).toHaveLength(1);
      expect(context.state.getNodes()[0].type).toBe('CodeFence');
    });
  });

  describe('nested interpretation', () => {
    it('should handle nested states correctly', () => {
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
      interpret(parentNodes, context.state);
      interpret(childNodes, childContext.state);
      childContext.state.mergeIntoParent();

      // Verify results
      expect(context.state.getDataVar('parent')).toBe('parent-value');
      expect(context.state.getDataVar('child')).toBe('child-value');
    });
  });

  describe('error handling', () => {
    it('should preserve error locations', () => {
      const location = context.createLocation(5, 3);
      const nodes: DirectiveNode[] = [
        context.createDirectiveNode('unknown', { name: 'test' }, location)
      ];

      try {
        interpret(nodes, context.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpretError);
        if (error instanceof MeldInterpretError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(5);
          expect(error.location?.column).toBe(3);
        }
      }
    });

    it('should handle errors in nested contexts', () => {
      const baseLocation = context.createLocation(5, 3);
      const nestedContext = context.createNestedContext(baseLocation);
      const nestedLocation = nestedContext.createLocation(2, 4);
      
      const nodes: DirectiveNode[] = [
        nestedContext.createDirectiveNode('unknown', { name: 'test' }, nestedLocation)
      ];

      try {
        interpret(nodes, nestedContext.state);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(MeldInterpretError);
        if (error instanceof MeldInterpretError) {
          expect(error.location).toBeDefined();
          expect(error.location?.line).toBe(6); // base.line (5) + relative.line (2) - 1
          expect(error.location?.column).toBe(4);
        }
      }
    });
  });
}); 