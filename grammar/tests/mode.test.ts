import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode, TextNode } from '@core/types';

describe('mode-aware parsing', () => {
  it('parses bare directives in strict mode', async () => {
    const result = await parse('var @name = "ok"', { mode: 'strict' });
    expect(result.success).toBe(true);
    const node = result.ast[0] as DirectiveNode;
    expect(node.kind).toBe('var');
  });

  it('treats bare directives as text in markdown mode', async () => {
    const result = await parse('var @name = "ok"', { mode: 'markdown' });
    expect(result.success).toBe(true);
    const node = result.ast[0] as TextNode;
    expect(node.type).toBe('Text');
    expect(node.content.trim()).toBe('var @name = "ok"');
  });

  it('errors on text lines in strict mode', async () => {
    const result = await parse('just text', { mode: 'strict' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Text content not allowed in strict mode (.mld). Use .mld.md for prose.');
  });

  it('ignores blank lines in strict mode', async () => {
    const source = '\n   \n/var @name = "ok"\n';
    const result = await parse(source, { mode: 'strict' });
    expect(result.success).toBe(true);
    expect(result.ast.length).toBe(1);
    const node = result.ast[0] as DirectiveNode;
    expect(node.kind).toBe('var');
  });
});
