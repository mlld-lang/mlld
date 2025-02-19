import { describe, it, expect, beforeEach } from 'vitest';
import { ContentResolver } from './ContentResolver.js';
import type { MeldNode, TextNode, CodeFenceNode, CommentNode, DirectiveNode } from 'meld-spec';
import { createMockStateService } from '@tests/utils/testFactories.js';
import { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';

describe('ContentResolver', () => {
  let resolver: ContentResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    resolver = new ContentResolver(stateService);
    context = {
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      currentFilePath: '',
      state: stateService
    };
  });

  it('should preserve text content exactly as is', async () => {
    const nodes: MeldNode[] = [{
      type: 'Text',
      content: '  Hello world  \n  with spaces  ',
      location: { start: { line: 1, column: 1 }, end: { line: 2, column: 13 } }
    } as TextNode];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('  Hello world  \n  with spaces  ');
  });

  it('should preserve code blocks exactly as is', async () => {
    const nodes: MeldNode[] = [{
      type: 'CodeFence',
      content: '\n  const x = 42;\n  console.log(x);\n',
      language: 'typescript',
      location: { start: { line: 1, column: 1 }, end: { line: 4, column: 1 } }
    } as CodeFenceNode];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('```typescript\n  const x = 42;\n  console.log(x);\n```');
  });

  it('should preserve nested code fences with different backtick counts', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before nested fences:\n\n',
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: '\nBasic fence\n',
        language: '',
        location: { start: { line: 3, column: 1 }, end: { line: 5, column: 1 } }
      } as CodeFenceNode,
      {
        type: 'Text',
        content: '\n',
        location: { start: { line: 5, column: 1 }, end: { line: 6, column: 1 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: '\nNested fence with\n```\ninner fence\n```\n',
        language: '',
        location: { start: { line: 6, column: 1 }, end: { line: 11, column: 1 } }
      } as CodeFenceNode
    ];

    const result = await resolver.resolve(nodes, context);

    // Each part should be preserved exactly as is, with no extra whitespace added
    expect(result).toBe('Before nested fences:\n\n```\nBasic fence\n```\n```\nNested fence with\n```\ninner fence\n```\n```');
  });

  it('should skip comments while preserving surrounding whitespace', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before  ',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
      } as TextNode,
      {
        type: 'Comment',
        content: 'This is a comment',
        location: { start: { line: 1, column: 9 }, end: { line: 1, column: 25 } }
      } as CommentNode,
      {
        type: 'Text',
        content: '  After',
        location: { start: { line: 1, column: 26 }, end: { line: 1, column: 33 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('Before    After');
  });

  it('should preserve whitespace in mixed content', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Text before\n\n',
        location: { start: { line: 1, column: 1 }, end: { line: 3, column: 1 } }
      } as TextNode,
      {
        type: 'CodeFence',
        content: '\nconsole.log("test");\n',
        language: 'typescript',
        location: { start: { line: 3, column: 1 }, end: { line: 5, column: 1 } }
      } as CodeFenceNode,
      {
        type: 'Comment',
        content: 'Skip this comment',
        location: { start: { line: 5, column: 1 }, end: { line: 5, column: 17 } }
      } as CommentNode,
      {
        type: 'Text',
        content: '\n\nText after',
        location: { start: { line: 5, column: 18 }, end: { line: 7, column: 10 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('Text before\n\n```typescript\nconsole.log("test");\n```\n\nText after');
  });

  it('should skip directive nodes while preserving surrounding whitespace', async () => {
    const nodes: MeldNode[] = [
      {
        type: 'Text',
        content: 'Before  ',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } }
      } as TextNode,
      {
        type: 'Directive',
        directive: {
          kind: 'text' as const,
          identifier: 'test',
          value: 'value'
        },
        location: { start: { line: 1, column: 9 }, end: { line: 1, column: 28 } }
      } as DirectiveNode,
      {
        type: 'Text',
        content: '  After',
        location: { start: { line: 1, column: 29 }, end: { line: 1, column: 36 } }
      } as TextNode
    ];

    const result = await resolver.resolve(nodes, context);

    expect(result).toBe('Before    After');
  });
}); 