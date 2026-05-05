import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateDirective } from './directive';
import { evaluateRecord } from './record';
import type { RecordDirectiveNode } from '@core/types/record';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/records.mld');
  return env;
}

function parseRecord(source: string): RecordDirectiveNode {
  const directive = parseSync(source).find((node: unknown): node is RecordDirectiveNode => {
    return Boolean(node) && typeof node === 'object' && (node as RecordDirectiveNode).kind === 'record';
  });
  if (!directive) {
    throw new Error('Expected a record directive');
  }
  return directive;
}

describe('evaluateRecord', () => {
  it('registers record definitions through directive evaluation', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [email: string, @input.organization as org: string?],
  data: [{ display: \`@input.first @input.last\` }: string],
  display: [email],
  when [
    internal => :internal
    * => data
  ],
  validate: "drop"
}
`);

    const result = await evaluateDirective(directive, env);
    const definition = env.getRecordDefinition('contact');
    const recordVariable = env.getVariable('contact');

    expect(result.value).toBe(definition);
    expect(recordVariable?.type).toBe('record');
    expect(recordVariable?.value).toBe(definition);
    expect(definition).toMatchObject({
      name: 'contact',
      rootMode: 'object',
      validate: 'drop',
      fields: [
        {
          kind: 'input',
          name: 'email',
          classification: 'fact',
          valueType: 'string',
          optional: false
        },
        {
          kind: 'input',
          name: 'org',
          classification: 'fact',
          valueType: 'string',
          optional: true
        },
        {
          kind: 'computed',
          name: 'display',
          classification: 'data',
          valueType: 'string',
          optional: false
        }
      ],
      display: {
        kind: 'legacy',
        entries: [{ kind: 'bare', field: 'email' }]
      },
      when: [
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
      ]
    });
    expect(definition?.location?.filePath).toBe('/project/records.mld');
  });

  it('preserves fact kind tags and accepts overrides on record fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @send_email_inputs = {
  facts: [
    recipients: { type: array, kind: "email" },
    cc: { type: array?, kind: ["email", "verified_email"], accepts: ["known", "fact:*.email"] }
  ],
  data: [subject: string],
  validate: "strict"
}
`);

    await evaluateDirective(directive, env);

    expect(env.getRecordDefinition('send_email_inputs')).toMatchObject({
      fields: [
        {
          name: 'recipients',
          classification: 'fact',
          valueType: 'array',
          optional: false,
          factKinds: ['email']
        },
        {
          name: 'cc',
          classification: 'fact',
          valueType: 'array',
          optional: true,
          factKinds: ['email', 'verified_email'],
          factAccepts: ['known', 'fact:*.email']
        },
        {
          name: 'subject',
          classification: 'data',
          valueType: 'string'
        }
      ]
    });
  });

  it('makes registered records visible to child environments', async () => {
    const env = createEnv();
    const directive = parseRecord('/record @contact = { facts: [email: string] }');

    await evaluateDirective(directive, env);

    const child = env.createChild('/project/child');
    expect(child.getRecordDefinition('contact')).toBe(env.getRecordDefinition('contact'));
  });

  it('normalizes trusted data fields and when branch reclassification', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @issue = {
  facts: [id: string],
  data: {
    trusted: [title: string],
    untrusted: [body: string]
  },
  when [
    @input.author_association == "MEMBER" => :maintainer {
      data: { trusted: [body] }
    }
    * => :external
  ]
}
`);

    await evaluateDirective(directive, env);

    expect(env.getRecordDefinition('issue')).toMatchObject({
      fields: [
        {
          name: 'id',
          classification: 'fact'
        },
        {
          name: 'title',
          classification: 'data',
          dataTrust: 'trusted'
        },
        {
          name: 'body',
          classification: 'data',
          dataTrust: 'untrusted'
        }
      ],
      when: [
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
                trusted: ['body']
              }
            }
          }
        },
        {
          condition: {
            type: 'wildcard'
          },
          result: {
            type: 'tiers',
            tiers: ['external']
          }
        }
      ]
    });
  });

  it('registers key declarations on record definitions', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @deal = {
  key: id,
  facts: [id: string]
}
`);

    await expect(evaluateRecord(directive, env)).resolves.toMatchObject({
      value: expect.objectContaining({
        key: 'id'
      })
    });
    expect(env.getRecordDefinition('deal')).toMatchObject({
      key: 'id'
    });
  });

  it('rejects impure computed fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [{ recipient: @lookup() }]
}
`);

    await expect(evaluateRecord(directive, env)).rejects.toMatchObject({
      code: 'INVALID_RECORD_FIELD'
    });
  });

  it('rejects when overrides that target fact fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @issue = {
  facts: [id: string],
  data: [title: string],
  when [
    @input.author_association == "MEMBER" => :maintainer {
      data: { trusted: [id] }
    }
  ]
}
`);

    await expect(evaluateRecord(directive, env)).rejects.toMatchObject({
      code: 'INVALID_RECORD_WHEN'
    });
  });

  it('preserves an explicit empty display list on the definition', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [email: string],
  display: []
}
`);

    await evaluateDirective(directive, env);

    expect(env.getRecordDefinition('contact')).toMatchObject({
      display: {
        kind: 'legacy',
        entries: []
      }
    });
  });

  it('infers scalar-root records from bare @input fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @slack_channel = {
  facts: [@input as name: string]
}
`);

    await evaluateDirective(directive, env);

    expect(env.getRecordDefinition('slack_channel')).toMatchObject({
      rootMode: 'scalar'
    });
  });

  it('infers map-entry records from @key and @value fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @hotel_price = {
  facts: [@key as hotel: string],
  data: [@value as price_range: string]
}
`);

    await evaluateDirective(directive, env);

    expect(env.getRecordDefinition('hotel_price')).toMatchObject({
      rootMode: 'map-entry'
    });
  });

  it('rejects display entries that reference unknown fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [email: string],
  display: [name]
}
`);

    await expect(evaluateRecord(directive, env)).rejects.toMatchObject({
      code: 'INVALID_RECORD_DISPLAY'
    });
  });

  it('rejects duplicate display entries for the same field', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [email: string],
  display: [email, { mask: "email" }]
}
`);

    await expect(evaluateRecord(directive, env)).rejects.toMatchObject({
      code: 'INVALID_RECORD_DISPLAY'
    });
  });

  it('allows bare data fields in legacy display lists', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [email: string],
  data: [notes: string?],
  display: [notes]
}
`);

    await evaluateRecord(directive, env);

    expect(env.getRecordDefinition('contact')).toMatchObject({
      display: {
        kind: 'legacy',
        entries: [{ kind: 'bare', field: 'notes' }]
      }
    });
  });

  it('supports named display modes for opposite visibility needs', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @email = {
  facts: [from: string, message_id: string],
  data: [subject: string, body: string],
  display: {
    worker: [{ mask: "from" }, subject, body],
    planner: [{ ref: "from" }, { handle: "message_id" }]
  }
}
`);

    await evaluateDirective(directive, env);

    expect(env.getRecordDefinition('email')).toMatchObject({
      display: {
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
      }
    });
  });

  it('rejects ref, mask, and handle entries on data fields', async () => {
    const env = createEnv();

    await expect(
      evaluateRecord(parseRecord(`
/record @contact = {
  facts: [email: string],
  data: [notes: string?],
  display: [{ ref: "notes" }]
}
`), env)
    ).rejects.toMatchObject({ code: 'INVALID_RECORD_DISPLAY' });

    await expect(
      evaluateRecord(parseRecord(`
/record @contact = {
  facts: [email: string],
  data: [notes: string?],
  display: [{ handle: "notes" }]
}
`), env)
    ).rejects.toMatchObject({ code: 'INVALID_RECORD_DISPLAY' });
  });
});
