import { describe, it, expect } from 'vitest';
import type { TextNode, CommentNode } from '@core/syntax/types';
import { createMockNode, createMockValidationContext, createMockLocation } from './utils/test-utils';
import { MeldAstError, ParseErrorCode } from '@core/ast/types';

describe('Validation Helpers', () => {
  describe('createMockValidationContext', () => {
    it('should track errors correctly', () => {
      const context = createMockValidationContext();
      expect(context.hasErrors()).toBe(false);

      const error = { message: 'test error' };
      context.addError(error);

      expect(context.hasErrors()).toBe(true);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0]).toBe(error);
    });
  });

  describe('Node Validation Example', () => {
    // Example validation function
    function validateTextNode(node: ReturnType<typeof createMockNode>, context: ReturnType<typeof createMockValidationContext>) {
      if (node.type !== 'Text') {
        context.addError({
          message: 'Expected Text node',
          location: node.location
        });
        return;
      }

      const textNode = node as TextNode;
      if (typeof textNode.content !== 'string') {
        context.addError({
          message: 'Text node content must be a string',
          location: node.location
        });
      }
    }

    function validateCommentNode(node: ReturnType<typeof createMockNode>, context: ReturnType<typeof createMockValidationContext>) {
      if (node.type !== 'Comment') {
        context.addError({
          message: 'Expected Comment node',
          location: node.location
        });
        return;
      }

      const commentNode = node as CommentNode;
      if (typeof commentNode.content !== 'string') {
        context.addError({
          message: 'Comment node content must be a string',
          location: node.location
        });
      }
    }

    it('should validate correct text nodes', () => {
      const node = createMockNode('Text', { content: 'Hello' });
      const context = createMockValidationContext();

      validateTextNode(node, context);
      expect(context.hasErrors()).toBe(false);
    });

    it('should catch invalid text nodes', () => {
      const node = createMockNode('Text', { content: 123 as any });
      const context = createMockValidationContext();

      validateTextNode(node, context);
      expect(context.hasErrors()).toBe(true);
      expect(context.errors[0].message).toBe('Text node content must be a string');
    });

    it('should catch wrong node types', () => {
      const node = createMockNode('Directive', {
        directive: { kind: 'run', command: 'echo hello' }
      });
      const context = createMockValidationContext();

      validateTextNode(node, context);
      expect(context.hasErrors()).toBe(true);
      expect(context.errors[0].message).toBe('Expected Text node');
    });

    it('should validate correct comment nodes', () => {
      const node = createMockNode('Comment', { content: 'A comment' });
      const context = createMockValidationContext();

      validateCommentNode(node, context);
      expect(context.hasErrors()).toBe(false);
    });

    it('should catch invalid comment nodes', () => {
      const node = createMockNode('Comment', { content: 123 as any });
      const context = createMockValidationContext();

      validateCommentNode(node, context);
      expect(context.hasErrors()).toBe(true);
      expect(context.errors[0].message).toBe('Comment node content must be a string');
    });

    it('should catch wrong node types for comments', () => {
      const node = createMockNode('Text', { content: 'Not a comment' });
      const context = createMockValidationContext();

      validateCommentNode(node, context);
      expect(context.hasErrors()).toBe(true);
      expect(context.errors[0].message).toBe('Expected Comment node');
    });
  });

  describe('Location Validation Example', () => {
    it('should validate node locations', () => {
      const location = createMockLocation(
        { line: 1, column: 1 },
        { line: 1, column: 10 }
      );

      const node = createMockNode('Text', { content: 'Hello' }, location);
      expect(node.location).toEqual(location);
    });

    it('should provide default location if not specified', () => {
      const node = createMockNode('Text', { content: 'Hello' });
      expect(node.location).toEqual({
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 }
      });
    });
  });
}); 