import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { ShelfDirectiveNode } from '@core/types/shelf';

function getFirstDirective(source: string): DirectiveNode {
  const ast = parseSync(source);
  const directive = ast.find((node: unknown): node is DirectiveNode => {
    return Boolean(node) && typeof node === 'object' && (node as DirectiveNode).type === 'Directive';
  });
  expect(directive).toBeDefined();
  return directive;
}

describe('shelf grammar', () => {
  it('parses shorthand and expanded shelf slots', () => {
    const directive = getFirstDirective(`
/shelf @outreach = {
  recipients: contact[],
  selected: contact? from recipients,
  log: { type: contact[], merge: "append" }
}
`) as ShelfDirectiveNode;

    expect(directive.kind).toBe('shelf');
    expect(directive.raw.identifier).toBe('outreach');
    expect(directive.meta.slotCount).toBe(3);
    expect(directive.values.slots).toEqual([
      expect.objectContaining({
        name: 'recipients',
        record: 'contact',
        cardinality: 'collection',
        optional: false,
        expanded: false
      }),
      expect.objectContaining({
        name: 'selected',
        record: 'contact',
        cardinality: 'singular',
        optional: true,
        from: 'recipients',
        expanded: false
      }),
      expect.objectContaining({
        name: 'log',
        record: 'contact',
        cardinality: 'collection',
        merge: 'append',
        expanded: true
      })
    ]);
  });
});
