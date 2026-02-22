import { describe, expect, it } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('/exe language blocks with args', () => {
  it('parses sh(@var) code blocks in exe context', async () => {
    const src = '/exe @deploy(path) = sh(@path) { printf "%s" "$path" }';
    const result = await parse(src, { mode: 'strict' });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw result.error;
    }

    const node = result.ast[0] as DirectiveNode;
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeCode');
    expect(node.meta?.language).toBe('sh');
    expect(Array.isArray(node.values?.args)).toBe(true);
    expect(node.values?.args?.[0]?.type).toBe('VariableReference');
    expect((node.values?.args?.[0] as any)?.identifier).toBe('path');
    expect(node.raw?.args).toEqual(['@path']);
  });
});
