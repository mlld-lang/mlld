import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';

function getFirstDirective(source: string): DirectiveNode {
  const ast = parseSync(source);
  const directive = ast.find((node: unknown): node is DirectiveNode => {
    return Boolean(node) && typeof node === 'object' && (node as DirectiveNode).type === 'Directive';
  });
  expect(directive).toBeDefined();
  return directive;
}

describe('guard grammar named operation refs', () => {
  it('parses canonical op:named: filters as operation guards', () => {
    const directive = getFirstDirective('/guard before @gate for op:named:email.send = when [ * => allow ]');

    expect(directive.kind).toBe('guard');
    expect(directive.meta.filterKind).toBe('operation');
    expect(directive.meta.filterValue).toBe('op:named:email.send');
    expect(directive.raw.filter).toBe('op:named:email.send');
  });

  it('rejects legacy bare @name guard filters', () => {
    expect(() => getFirstDirective('/guard before @gate for @email.send = when [ * => allow ]')).toThrow();
  });
});
