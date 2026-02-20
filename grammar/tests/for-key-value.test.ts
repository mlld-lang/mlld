import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

type AnyNode = Record<string, any>;

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

describe('For key/value grammar', () => {
  it('parses for directive with key and value variables', () => {
    const ast = parseSync('/for @k, @v in @obj => show @v');
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('for');
    expect(directive.values?.key?.[0]?.identifier).toBe('k');
    expect(directive.values?.variable?.[0]?.identifier).toBe('v');
  });

  it('parses for expression with key and value variables', () => {
    const ast = parseSync('/var @out = for @k, @v in @obj => @v');
    const forExpr = findNode(ast, (node) => node.type === 'ForExpression');

    expect(forExpr).toBeTruthy();
    expect(forExpr?.keyVariable?.identifier).toBe('k');
    expect(forExpr?.variable?.identifier).toBe('v');
  });

  it('rejects field access on key variables', () => {
    expect(() => parseSync('/for @k.field, @v in @obj => show @v')).toThrow(/Cannot access field/);
  });
});
