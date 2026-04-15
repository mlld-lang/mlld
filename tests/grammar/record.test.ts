import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { buildRecordDefinitionFromDirective } from '@core/validation/record-definition';
import { formatRecordDefinition } from '@core/types/record';
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
  it('parses inline dynamic record coercion as a terminal postfix expression', () => {
    const directive = getFirstDirective(`
/var @result = @raw as record @schema
`) as DirectiveNode;

    expect(directive.kind).toBe('var');
    expect((directive.values as any).value?.[0]).toMatchObject({
      type: 'CoerceExpression',
      value: {
        type: 'VariableReference',
        identifier: 'raw'
      },
      schema: {
        type: 'VariableReference',
        identifier: 'schema'
      }
    });
  });

  it('parses grouped inline coercion field access for mx metadata reads', () => {
    const directive = getFirstDirective(`
/var @valid = (@raw as record @schema).mx.schema.valid
`) as DirectiveNode;

    expect(directive.kind).toBe('var');
    expect((directive.values as any).value?.[0]).toMatchObject({
      type: 'CoerceExpression',
      fields: [
        { type: 'field', value: 'mx' },
        { type: 'field', value: 'schema' },
        { type: 'field', value: 'valid' }
      ]
    });
  });

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

    expect(directive.values.display).toEqual({
      kind: 'legacy',
      entries: [
        { kind: 'bare', field: 'name' },
        { kind: 'mask', field: 'email' }
      ]
    });
    expect(directive.values.facts?.[2]).toMatchObject({
      kind: 'computed',
      name: 'display',
      valueType: 'string',
      optional: false
    });
  });

  it('parses trusted and untrusted data groups plus when branch reclassification', () => {
    const directive = getFirstDirective(`
/record @issue = {
  facts: [id: string],
  data: {
    trusted: [title: string],
    untrusted: [body: string]
  },
  when [
    @input.author_association == "MEMBER" => :maintainer {
      data: { trusted: [title] }
    }
    * => data
  ]
}
`) as RecordDirectiveNode;

    expect(directive.meta).toMatchObject({
      fieldCount: 3,
      factCount: 1,
      dataCount: 2,
      hasWhen: true
    });

    expect(directive.values.data).toEqual([
      expect.objectContaining({
        name: 'title',
        valueType: 'string',
        optional: false,
        dataTrust: 'trusted'
      }),
      expect.objectContaining({
        name: 'body',
        valueType: 'string',
        optional: false,
        dataTrust: 'untrusted'
      })
    ]);

    expect(directive.values.when).toEqual([
      {
        condition: {
          type: 'comparison',
          field: 'author_association',
          sourceRoot: 'input',
          path: ['author_association'],
          operator: '==',
          value: 'MEMBER'
        },
        result: {
          type: 'tiers',
          tiers: ['maintainer'],
          overrides: {
            data: {
              trusted: ['title']
            }
          }
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

  it('preserves an explicit empty display list', () => {
    const directive = getFirstDirective(`
/record @contact = {
  facts: [email: string],
  display: []
}
`) as RecordDirectiveNode;

    expect(directive.values.display).toEqual({
      kind: 'legacy',
      entries: []
    });
  });

  it('parses array, handle, and optional record field annotations', () => {
    const directive = getFirstDirective(`
/record @calendar_evt = {
  facts: [participants: array?, recipients: array, channel: handle],
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
      }),
      expect.objectContaining({
        name: 'channel',
        valueType: 'handle',
        optional: false
      })
    ]);
  });

  it('parses top-level input policy sections on records', () => {
    const directive = getFirstDirective(`
/record @send_email_inputs = {
  facts: [recipient: string, cc: string?],
  data: [subject: string, body: string?],
  exact: [subject],
  update: [body],
  allowlist: { recipient: @approved_recipients },
  blocklist: { recipient: ["blocked-recipient"] },
  optional_benign: [cc]
}
`) as RecordDirectiveNode;

    expect(directive.values.exact).toEqual(['subject']);
    expect(directive.values.update).toEqual(['body']);
    expect(directive.values.optionalBenign).toEqual(['cc']);
    expect(directive.values.allowlist).toMatchObject({
      recipient: {
        type: 'VariableReference',
        identifier: 'approved_recipients'
      }
    });
    expect(directive.values.blocklist).toMatchObject({
      recipient: {
        type: 'array',
        items: [
          {
            type: 'Literal',
            value: 'blocked-recipient'
          }
        ]
      }
    });

    const { definition, issues } = buildRecordDefinitionFromDirective(directive);
    expect(issues).toEqual([]);
    expect(definition).toMatchObject({
      direction: 'input',
      inputPolicy: {
        exact: ['subject'],
        update: ['body'],
        optionalBenign: ['cc'],
        allowlist: {
          recipient: { kind: 'reference', name: 'approved_recipients' }
        },
        blocklist: {
          recipient: { kind: 'array', values: ['blocked-recipient'] }
        }
      }
    });
  });

  it('rejects prefix optional markers on record fields', () => {
    expect(() => parseSync(`
/record @contact = {
  facts: [email?: string]
}
`)).toThrow();
  });

  it('rejects per-field attribute bags', () => {
    expect(() => parseSync(`
/record @contact = {
  facts: [email: string { exact: true }]
}
`)).toThrow(/field_attribute_bag_used/i);
  });

  it('rejects unknown top-level record sections', () => {
    expect(() => parseSync(`
/record @contact = {
  facts: [email: string],
  attrs: { email: { exact: true } }
}
`)).toThrow(/unknown_record_section/i);
  });

  it('reports exact and update fields that point at fact fields', () => {
    const directive = getFirstDirective(`
/record @send_email_inputs = {
  facts: [recipient: string],
  data: [subject: string],
  exact: [recipient],
  update: [recipient]
}
`) as RecordDirectiveNode;

    const { issues } = buildRecordDefinitionFromDirective(directive);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'exact_field_not_in_data' }),
        expect.objectContaining({ code: 'update_field_not_in_data' })
      ])
    );
  });

  it('reports optional_benign fields that are not optional facts', () => {
    const directive = getFirstDirective(`
/record @send_email_inputs = {
  facts: [recipient: string, cc: string?],
  data: [subject: string],
  optional_benign: [recipient, subject]
}
`) as RecordDirectiveNode;

    const { issues } = buildRecordDefinitionFromDirective(directive);
    expect(
      issues.filter(issue => issue.code === 'optional_benign_invalid_field')
    ).toHaveLength(2);
  });

  it('parses input-direction correlate declarations on records', () => {
    const directive = getFirstDirective(`
/record @send_email_inputs = {
  facts: [recipient: string, tx_id: string],
  data: [body: string?],
  correlate: false
}
`) as RecordDirectiveNode;

    expect(directive.values.correlate).toBe(false);

    const { definition, issues } = buildRecordDefinitionFromDirective(directive);
    expect(issues).toEqual([]);
    expect(definition).toMatchObject({
      direction: 'input',
      correlate: false
    });
  });

  it('parses object-typed record field annotations', () => {
    const directive = getFirstDirective(`
/record @worker_output = {
  facts: [worker: string],
  data: [state_patch: object, summary: string?]
}
`) as RecordDirectiveNode;

    expect(directive.values.data).toEqual([
      expect.objectContaining({
        name: 'state_patch',
        valueType: 'object',
        optional: false
      }),
      expect.objectContaining({
        name: 'summary',
        valueType: 'string',
        optional: true
      })
    ]);
  });

  it('parses named display modes with bare, ref, mask, and handle entries', () => {
    const directive = getFirstDirective(`
/record @email = {
  facts: [from: string, message_id: string],
  data: [subject: string, body: string],
  display: {
    worker: [{ mask: "from" }, subject, body],
    planner: [{ ref: "from" }, { handle: "message_id" }]
  }
}
`) as RecordDirectiveNode;

    expect(directive.values.display).toEqual({
      kind: 'named',
      modes: {
        worker: [
          { kind: 'mask', field: 'from' },
          { kind: 'bare', field: 'subject' },
          { kind: 'bare', field: 'body' }
        ],
        planner: [
          { kind: 'ref', field: 'from' },
          { kind: 'handle', field: 'message_id' }
        ]
      }
    });
  });

  it('parses role-labeled named display modes and formats them canonically', () => {
    const directive = getFirstDirective(`
/record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: {
    role:planner: [name, { ref: "email" }],
    "role:worker": [{ mask: "email" }, name, notes]
  }
}
`) as RecordDirectiveNode;

    expect(directive.values.display).toEqual({
      kind: 'named',
      modes: {
        'role:planner': [
          { kind: 'bare', field: 'name' },
          { kind: 'ref', field: 'email' }
        ],
        'role:worker': [
          { kind: 'mask', field: 'email' },
          { kind: 'bare', field: 'name' },
          { kind: 'bare', field: 'notes' }
        ]
      }
    });

    const { definition, issues } = buildRecordDefinitionFromDirective(directive);
    expect(issues).toEqual([]);
    expect(definition).toBeDefined();
    expect(formatRecordDefinition(definition!)).toContain(
      'display: { role:planner: [name, { ref: "email" }], role:worker: [{ mask: "email" }, name, notes] }'
    );
  });

  it('parses plain object role keys for policy authorizable declarations', () => {
    const directive = getFirstDirective(`
/var @policy = {
  authorizations: {
    authorizable: {
      role:planner: [@sendEmail]
    }
  }
}
`) as DirectiveNode;

    expect(directive.kind).toBe('var');
    expect((directive.values as any).value?.[0]).toMatchObject({
      type: 'object',
      entries: expect.arrayContaining([
        expect.objectContaining({
          key: 'authorizations',
          value: expect.objectContaining({
            type: 'object',
            entries: expect.arrayContaining([
              expect.objectContaining({
                key: 'authorizable',
                value: expect.objectContaining({
                  type: 'object',
                  entries: expect.arrayContaining([
                    expect.objectContaining({
                      key: 'role:planner'
                    })
                  ])
                })
              })
            ])
          })
        })
      ])
    });
  });

  it('parses bare root adapters for scalar and map-entry record fields', () => {
    const directive = getFirstDirective(`
/record @hotel_price = {
  facts: [@input as name: string, @key as hotel: string],
  data: [@value as price_range: string?]
}
`) as RecordDirectiveNode;

    expect(directive.values.facts?.[0]).toMatchObject({
      kind: 'input',
      name: 'name',
      sourceRoot: 'input',
      source: {
        identifier: 'input',
        fields: []
      }
    });
    expect(directive.values.facts?.[1]).toMatchObject({
      kind: 'input',
      name: 'hotel',
      sourceRoot: 'key',
      source: {
        identifier: 'key',
        fields: []
      }
    });
    expect(directive.values.data?.[0]).toMatchObject({
      kind: 'input',
      name: 'price_range',
      sourceRoot: 'value',
      source: {
        identifier: 'value',
        fields: []
      },
      optional: true
    });
  });

  it('parses record key declarations', () => {
    const directive = getFirstDirective(`
/record @deal = {
  key: id,
  facts: [id: string]
}
`) as RecordDirectiveNode;

    expect(directive.values.key).toBe('id');
    expect(directive.meta.hasKey).toBe(true);
  });
});
