import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('Checkpoint directive', () => {
  it('parses /checkpoint with a quoted name', () => {
    const ast = parseSync('/checkpoint "review-start"', { mode: 'strict' });
    const node = ast[0] as DirectiveNode;

    expect(node.kind).toBe('checkpoint');
    expect(node.subtype).toBe('checkpoint');
    expect(node.values.name).toBe('review-start');
  });

  it('supports inline comments', () => {
    const ast = parseSync('/checkpoint "stage-a" >> marker', { mode: 'strict' });
    const node = ast[0] as DirectiveNode;

    expect(node.kind).toBe('checkpoint');
    expect(node.values.name).toBe('stage-a');
    expect(node.meta.comment).toBeDefined();
  });

  it('rejects missing checkpoint name', () => {
    expect(() => parseSync('/checkpoint', { mode: 'strict' })).toThrow();
  });
});
