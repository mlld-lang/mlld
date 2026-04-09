import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('loop grammar', () => {
  test('preserves withClause tails on loop directives', async () => {
    const result = await parse('/loop(1) [ show "ok" ] with { format: "text", guards: false }', {
      mode: 'markdown'
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const node: any = result.ast[0];
    expect(node.kind).toBe('loop');
    expect(node.values?.withClause).toMatchObject({ format: 'text', guards: false });
    expect(node.raw?.withClause).toMatchObject({ format: 'text', guards: false });
    expect(node.meta?.withClause).toMatchObject({ format: 'text', guards: false });
  });

  test('merges ending parallel caps into loop withClause', async () => {
    const result = await parse('/loop(1) [ show "ok" ] with { pipeline: [@trim] } (3, 20ms)', {
      mode: 'markdown'
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const node: any = result.ast[0];
    expect(node.kind).toBe('loop');
    expect(node.values?.withClause?.parallel).toBe(3);
    expect(node.values?.withClause?.delayMs).toBe(20);
    expect(node.values?.withClause?.pipeline).toHaveLength(1);
    expect(node.values?.withClause?.pipeline?.[0]?.rawIdentifier).toBe('trim');
  });
});
