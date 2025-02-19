import { describe, it, expect, beforeEach } from 'vitest';
import { ContentResolver } from './ContentResolver.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode } from 'meld-spec';
import { createMockStateService } from '@tests/utils/testFactories.js';

describe('ContentResolver', () => {
  let resolver: ContentResolver;
  let stateService: ReturnType<typeof createMockStateService>;

  beforeEach(() => {
    stateService = createMockStateService();
    resolver = new ContentResolver(stateService);
  });

  it('should preserve regular text content', async () => {
    const nodes: MeldNode[] = [{
      type: 'Text',
      content: 'Hello world',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
    } as TextNode];

    const result = await resolver.resolve(nodes, {
      allowedVariableTypes: {},
      currentFilePath: ''
    });

    expect(result).toBe('Hello world');
  });

  it('should preserve code blocks with backticks', async () => {
    const nodes: MeldNode[] = [{
      type: 'CodeFence',
      content: 'const x = 42;',
      language: '',
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 13 } }
    } as CodeFenceNode];

    const result = await resolver.resolve(nodes, {
      allowedVariableTypes: {},
      currentFilePath: ''
    });

    expect(result).toBe('```\nconst x = 42;\n```');
  });

  it('should skip comment nodes', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }
      } as TextNode,
      {
        type: 'Comment',
        content: 'This is a comment',
        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 17 } }
      } as CommentNode,
      {
        type: 'Text',
        content: 'After',
        location: { start: { line: 3, column: 1 }, end: { line: 3, column: 5 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, {
      allowedVariableTypes: {},
      currentFilePath: ''
    });

    expect(result).toBe('Before\nAfter');
  });

  it('should handle mixed content types', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Text before',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 11 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: 'console.log("test");',
        language: '',
        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 20 } }
      } as CodeFenceNode,
      {
        type: 'Comment',
        content: 'Skip this comment',
        location: { start: { line: 3, column: 1 }, end: { line: 3, column: 17 } }
      } as CommentNode,
      {
        type: 'Text',
        content: 'Text after',
        location: { start: { line: 4, column: 1 }, end: { line: 4, column: 10 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, {
      allowedVariableTypes: {},
      currentFilePath: ''
    });

    expect(result).toBe('Text before\n\n```\nconsole.log("test");\n```\n\nText after');
  });

  it('should skip directive nodes', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 7 } }
      } as TextNode,
      {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 20 } }
      },
      {
        type: 'Text',
        content: 'After',
        location: { start: { line: 3, column: 1 }, end: { line: 3, column: 6 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, {
      allowedVariableTypes: {},
      currentFilePath: ''
    });

    expect(result).toBe('Before\nAfter');
  });
}); 