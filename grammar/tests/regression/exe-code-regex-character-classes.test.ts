import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('exe code regex character classes regression', () => {
  test('parses node code regex with quoted character classes and continues parsing later directives', async () => {
    const input = [
      '/exe @extractMeta(atom) = node {',
      "  const lines = ['title: \"quoted\"'];",
      '  function get(key) {',
      "    const line = lines.find(function(l) { return l.startsWith(key + ':'); });",
      "    return line ? line.slice(key.length + 1).trim().replace(/^[\"']|[\"']$/g, '') : '';",
      '  }',
      "  return { title: get('title') };",
      '}',
      '',
      '/exe @next() = `ok`',
      '/show @next()',
    ].join('\n');

    const result = await parse(input, { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const directives = result.ast.filter(
      (node): node is DirectiveNode => node.type === 'Directive'
    );
    expect(directives).toHaveLength(3);
    expect(
      directives.some(node => node.kind === 'exe' && node.raw?.identifier === 'next')
    ).toBe(true);
  });
});
