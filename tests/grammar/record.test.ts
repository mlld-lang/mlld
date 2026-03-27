import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import type { DirectiveNode } from '@core/types';
import type { RecordDirectiveNode } from '@core/types/record';

function getFirstDirective(source: string): DirectiveNode {
  const ast = parseSync(source);
  const directive = ast.find((node: unknown): node is DirectiveNode => {
    return Boolean(node) && typeof node === 'object' && (node as DirectiveNode).type === 'Directive';
  });
  expect(directive).toBeDefined();
  return directive;
}

describe('record grammar', () => {
  it('parses record fields, remaps, computed values, and newline-separated when rules', () => {
    const directive = getFirstDirective(`
/record @contact = {
  facts: [
    email: string,
    @input.organization as org: string?,
    { display: \`@input.first @input.last\` }: string
  ],
  data: [notes: string?],
  when [
    internal => :internal
    * => data
  ],
  validate: "drop"
}
`) as RecordDirectiveNode;

    expect(directive.kind).toBe('record');
    expect(directive.raw.identifier).toBe('contact');
    expect(directive.meta).toMatchObject({
      fieldCount: 4,
      factCount: 3,
      dataCount: 1,
      hasWhen: true,
      validate: 'drop'
    });

    expect(directive.values.facts).toHaveLength(3);
    expect(directive.values.facts?.[0]).toMatchObject({
      kind: 'input',
      name: 'email',
      valueType: 'string',
      optional: false
    });
    expect(directive.values.facts?.[1]).toMatchObject({
      kind: 'input',
      name: 'org',
      valueType: 'string',
      optional: true
    });
    expect(directive.values.facts?.[2]).toMatchObject({
      kind: 'computed',
      name: 'display',
      valueType: 'string',
      optional: false
    });
    expect(directive.values.data?.[0]).toMatchObject({
      kind: 'input',
      name: 'notes',
      valueType: 'string',
      optional: true
    });
    expect(directive.values.display).toBeUndefined();

    expect(directive.values.when).toEqual([
      {
        condition: {
          type: 'truthy',
          field: 'internal'
        },
        result: {
          type: 'tiers',
          tiers: ['internal']
        }
      },
      {
        condition: {
          type: 'wildcard'
        },
        result: {
          type: 'data'
        }
      }
    ]);
  });

  it('parses top-level display entries without conflicting with computed data fields', () => {
    const directive = getFirstDirective(`
/record @contact = {
  facts: [
    email: string,
    name: string,
    { display: \`@input.first @input.last\` }: string
  ],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
`) as RecordDirectiveNode;

    expect(directive.values.display).toEqual([
      { kind: 'bare', field: 'name' },
      { kind: 'mask', field: 'email' }
    ]);
    expect(directive.values.facts?.[2]).toMatchObject({
      kind: 'computed',
      name: 'display',
      valueType: 'string',
      optional: false
    });
  });

  it('preserves an explicit empty display list', () => {
    const directive = getFirstDirective(`
/record @contact = {
  facts: [email: string],
  display: []
}
`) as RecordDirectiveNode;

    expect(directive.values.display).toEqual([]);
  });

  it('parses array and optional array record field annotations', () => {
    const directive = getFirstDirective(`
/record @calendar_evt = {
  facts: [participants: array?, recipients: array],
  data: [title: string?]
}
`) as RecordDirectiveNode;

    expect(directive.values.facts).toEqual([
      expect.objectContaining({
        name: 'participants',
        valueType: 'array',
        optional: true
      }),
      expect.objectContaining({
        name: 'recipients',
        valueType: 'array',
        optional: false
      })
    ]);
  });

  it('captures deferred key declarations as unsupported record entries', () => {
    const directive = getFirstDirective(`
/record @deal = {
  key: id,
  facts: [id: string]
}
`) as RecordDirectiveNode;

    expect(directive.values.unsupported).toHaveLength(1);
    expect(directive.values.unsupported?.[0]?.key).toBe('key');
  });
});
