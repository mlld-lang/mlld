import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';

type AnyNode = Record<string, unknown>;

function hasNode(value: unknown, predicate: (node: AnyNode) => boolean): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const node = value as AnyNode;
  if (predicate(node)) {
    return true;
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      if (child.some(item => hasNode(item, predicate))) {
        return true;
      }
      continue;
    }
    if (hasNode(child, predicate)) {
      return true;
    }
  }
  return false;
}

describe('Grammar - multiline method chaining', () => {
  it('parses multiline method chains in exe assignment expressions', () => {
    const ast = parseSync(
      `/exe @buildPrompt(tmpl, failure) = @tmpl\n` +
        `  .replace("@topic", @failure.topic)\n` +
        `  .replace("@experiment", @failure.experiment)\n` +
        `  .replace("@resultsPath", @failure.resultsPath)\n`
    );
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('exe');
    expect(hasNode(directive, node => node.type === 'ExecInvocation')).toBe(true);
  });

  it('parses multiline method chains in var assignment expressions', () => {
    const ast = parseSync(
      `/var @result = @tmpl\n` +
        `  .replace("@topic", "a")\n` +
        `  .replace("@experiment", "b")\n`
    );
    const directive = ast[0] as AnyNode;

    expect(directive.kind).toBe('var');
    expect(hasNode(directive, node => node.type === 'ExecInvocation')).toBe(true);
  });
});
