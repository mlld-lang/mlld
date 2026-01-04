import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

describe('/exe RHS pipelines', () => {
  it('parses variable-to-command pipeline without run sugar', async () => {
    const src = '/exe @pipe(value) = @value | cmd { cat }';
    const { ast } = await parse(src);

    const node = ast[0] as DirectiveNode;
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeCommand');
    expect(node.values.withClause?.pipeline).toBeDefined();
    expect(node.values.withClause?.pipeline?.[0]?.rawIdentifier).toBe('cat');
    expect(node.raw.pipeline).toBe('@cat');
  });

  it('parses run pipe sugar for backward compatibility', async () => {
    const src = '/exe @pipe(value) = run @value | cmd { cat }';
    const { ast } = await parse(src);

    const node = ast[0] as DirectiveNode;
    expect(node.kind).toBe('exe');
    expect(node.subtype).toBe('exeCommand');
    expect(node.values.withClause?.stdin?.identifier).toBe('value');
    expect(node.raw.command).toContain('cat');
  });
});
