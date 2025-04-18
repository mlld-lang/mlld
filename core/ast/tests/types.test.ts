/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import type { MeldNode, NodeType, DirectiveNode, TextNode } from '@core/syntax/types.js';
import { parse } from '@core/ast';
import { MeldAstError, ParseErrorCode, ParseResult, ParserOptions } from '@core/ast/types.js';
import { createMockNode, createMockLocation, createMockParser, hasErrors } from './utils/test-utils.js';

// This file contains type tests that are checked by TypeScript
// but not executed at runtime. The tests verify that our types
// work correctly and catch type errors at compile time.

describe('Type Tests', () => {
  it('should maintain type compatibility', async () => {
    // Create nodes with correct types
    const textNode = createMockNode('Text', { content: 'Hello' });
    expect(textNode.type).toBe('Text');
    expect(textNode.content).toBe('Hello');

    const directiveNode = createMockNode('Directive', {
      directive: { kind: 'run', command: 'echo hello' }
    });
    expect(directiveNode.type).toBe('Directive');
    expect(directiveNode.directive.kind).toBe('run');
    expect(directiveNode.directive.command).toBe('echo hello');

    // Test parse result
    const parseResult = await parse('Hello');
    expect(parseResult).toHaveProperty('ast');
    expect(Array.isArray(parseResult.ast)).toBe(true);
    
    // Test error creation
    const error = new MeldAstError('test error', createMockLocation(), undefined, ParseErrorCode.SYNTAX_ERROR);
    expect(error).toBeInstanceOf(MeldAstError);
    expect(error.message).toBe('test error');
    expect(error.code).toBe(ParseErrorCode.SYNTAX_ERROR);

    // Test parser options
    const options: ParserOptions = {
      failFast: true,
      trackLocations: true,
      validateNodes: true,
      onError: (error: MeldAstError) => console.error(error)
    };
    expect(options.failFast).toBe(true);
    expect(options.trackLocations).toBe(true);
    expect(options.validateNodes).toBe(true);
    expect(typeof options.onError).toBe('function');

    // Test hasErrors type guard
    const resultWithErrors: ParseResult = {
      ast: [],
      errors: [new MeldAstError('test error')]
    };
    expect(hasErrors(resultWithErrors)).toBe(true);
    if (hasErrors(resultWithErrors)) {
      expect(Array.isArray(resultWithErrors.errors)).toBe(true);
      expect(resultWithErrors.errors[0]).toBeInstanceOf(MeldAstError);
    }

    // Test type guards
    function isTextNode(node: MeldNode): node is TextNode {
      return node.type === 'Text';
    }

    function isDirectiveNode(node: MeldNode): node is DirectiveNode {
      return node.type === 'Directive';
    }

    expect(isTextNode(textNode)).toBe(true);
    expect(isDirectiveNode(directiveNode)).toBe(true);
    
    if (isTextNode(textNode)) {
      expect(typeof textNode.content).toBe('string');
    }

    if (isDirectiveNode(directiveNode)) {
      expect(directiveNode.directive.kind).toBe('run');
      expect(typeof directiveNode.directive.command).toBe('string');
    }
  });
});