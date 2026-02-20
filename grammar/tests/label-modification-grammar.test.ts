import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

type AnyNode = Record<string, unknown>;

function findNode(value: unknown, predicate: (node: AnyNode) => boolean): AnyNode | null {
  if (value && typeof value === 'object') {
    const node = value as AnyNode;
    if (predicate(node)) return node;
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = findNode(item, predicate);
          if (found) return found;
        }
      } else {
        const found = findNode(child, predicate);
        if (found) return found;
      }
    }
  }
  return null;
}

describe('Label modification grammar', () => {
  it('parses return label additions', () => {
    const ast = parseSync('/exe @tag() = [ => pii,internal @value ]');
    const node = findNode(ast, (item) => item.type === 'LabelModification');
    expect(node).toBeTruthy();
    expect((node?.modifiers as any[])).toEqual([
      { kind: 'add', label: 'pii' },
      { kind: 'add', label: 'internal' }
    ]);
  });

  it('parses trust and removal modifiers', () => {
    const ast = parseSync('/exe @tag() = [ => trusted!,!pii @value ]');
    const node = findNode(ast, (item) => item.type === 'LabelModification');
    expect(node).toBeTruthy();
    const modifiers = node?.modifiers as any[];
    expect(modifiers[0]).toEqual({ kind: 'bless' });
    expect(modifiers[1]).toEqual({ kind: 'remove', label: 'pii' });
  });
});
