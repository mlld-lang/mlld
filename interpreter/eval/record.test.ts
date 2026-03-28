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

    expect(result.value).toBe(definition);
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
      display: [{ kind: 'bare', field: 'email' }],
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

  it('makes registered records visible to child environments', async () => {
    const env = createEnv();
    const directive = parseRecord('/record @contact = { facts: [email: string] }');

    await evaluateDirective(directive, env);

    const child = env.createChild('/project/child');
    expect(child.getRecordDefinition('contact')).toBe(env.getRecordDefinition('contact'));
  });

  it('rejects deferred key declarations', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @deal = {
  key: id,
  facts: [id: string]
}
`);

    await expect(evaluateRecord(directive, env)).rejects.toMatchObject({
      code: 'RECORD_KEY_UNSUPPORTED'
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
      display: []
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

  it('rejects display entries that target data fields', async () => {
    const env = createEnv();
    const directive = parseRecord(`
/record @contact = {
  facts: [email: string],
  data: [notes: string?],
  display: [notes]
}
`);

    await expect(evaluateRecord(directive, env)).rejects.toMatchObject({
      code: 'INVALID_RECORD_DISPLAY'
    });
  });
});
