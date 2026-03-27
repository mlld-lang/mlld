import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { Environment } from '@interpreter/env/Environment';
import type { RecordDirectiveNode } from '@core/types/record';
import { makeSecurityDescriptor } from '@core/types/security';
import { evaluateRecord } from '@interpreter/eval/record';
import { coerceRecordOutput } from './coerce-record';
import { accessField } from '@interpreter/utils/field-access';
import { getRecordProjectionMetadata, isStructuredValue } from '@interpreter/utils/structured-value';

function createEnvironment(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
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

async function registerRecord(env: Environment, source: string) {
  const directive = parseRecord(source);
  await evaluateRecord(directive, env);
  const definition = env.getRecordDefinition(directive.raw.identifier);
  expect(definition).toBeDefined();
  return definition!;
}

async function accessNamedField(value: unknown, fieldName: string) {
  return accessField(value, { type: 'field', value: fieldName } as any);
}

describe('record output coercion', () => {
  it('binds @input through the reserved system slot during field evaluation', async () => {
    const env = createEnvironment();
    (env as any).reservedNames.add('input');
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [
    email: string,
    @input.organization as org: string?
  ]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        organization: 'analytical'
      },
      env
    });

    expect(output.mx.schema?.valid).toBe(true);
    const org = await accessNamedField(output, 'org');
    expect(isStructuredValue(org)).toBe(true);
    expect(org.text).toBe('analytical');
  });

  it('coerces objects, remaps fields, evaluates computed fields, and attaches fact metadata', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
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
  ]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        organization: 'analytical',
        first: 'Ada',
        last: 'Lovelace',
        internal: true
      },
      env
    });

    expect(output.mx.schema?.valid).toBe(true);
    expect(output.mx.factsources?.map(handle => handle.ref)).toEqual([
      '@contact.email',
      '@contact.org',
      '@contact.display'
    ]);
    expect(getRecordProjectionMetadata(output)).toEqual({
      kind: 'record',
      recordName: 'contact',
      hasDisplay: false,
      fields: {
        email: { classification: 'fact', display: 'bare' },
        org: { classification: 'fact', display: 'bare' },
        display: { classification: 'fact', display: 'bare' },
        notes: { classification: 'data', display: 'bare' }
      }
    });

    const email = await accessNamedField(output, 'email');
    expect(isStructuredValue(email)).toBe(true);
    expect(email.mx.labels).toContain('fact:internal:@contact.email');
    expect(email.mx.factsources?.map(handle => handle.ref)).toEqual(['@contact.email']);
    expect(getRecordProjectionMetadata(email)).toEqual({
      kind: 'field',
      recordName: 'contact',
      fieldName: 'email',
      classification: 'fact',
      display: 'bare',
      hasDisplay: false
    });

    const org = await accessNamedField(output, 'org');
    expect(isStructuredValue(org)).toBe(true);
    expect(org.text).toBe('analytical');

    const display = await accessNamedField(output, 'display');
    expect(isStructuredValue(display)).toBe(true);
    expect(display.text).toBe('Ada Lovelace');
  });

  it('coerces fenced JSON arrays into arrays of structured record objects', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, '/record @contact = { facts: [email: string] }');

    const output = await coerceRecordOutput({
      definition,
      value: 'Here is the JSON:\n```json\n[{"email":"a@example.com"},{"email":"b@example.com"}]\n```',
      env
    });

    expect(output.type).toBe('array');
    expect(output.mx.schema?.valid).toBe(true);
    expect(Array.isArray(output.data)).toBe(true);
    expect(output.data).toHaveLength(2);

    const first = output.data[0];
    expect(isStructuredValue(first)).toBe(true);
    expect(getRecordProjectionMetadata(first)).toEqual({
      kind: 'record',
      recordName: 'contact',
      hasDisplay: false,
      fields: {
        email: { classification: 'fact', display: 'bare' }
      }
    });
    const firstEmail = await accessNamedField(first, 'email');
    expect(isStructuredValue(firstEmail)).toBe(true);
    expect(firstEmail.text).toBe('a@example.com');
    expect(firstEmail.mx.labels).toContain('fact:@contact.email');
  });

  it('attaches explicit display metadata to record and field values', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada',
        notes: 'hi'
      },
      env
    });

    expect(getRecordProjectionMetadata(output)).toEqual({
      kind: 'record',
      recordName: 'contact',
      hasDisplay: true,
      fields: {
        email: { classification: 'fact', display: 'mask' },
        name: { classification: 'fact', display: 'bare' },
        notes: { classification: 'data', display: 'bare' }
      }
    });

    const email = await accessNamedField(output, 'email');
    expect(isStructuredValue(email)).toBe(true);
    expect(getRecordProjectionMetadata(email)).toEqual({
      kind: 'field',
      recordName: 'contact',
      fieldName: 'email',
      classification: 'fact',
      display: 'mask',
      hasDisplay: true
    });
  });

  it('clears inherited untrusted from fact fields while preserving it on data fields', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @transaction = {
  facts: [id: string, recipient: string],
  data: [subject: string]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        id: 'tx-1',
        recipient: 'acct-1',
        subject: 'Rent'
      },
      env,
      inheritedDescriptor: makeSecurityDescriptor({
        labels: ['untrusted', 'src:mcp'],
        sources: ['mcp:bank']
      })
    });

    expect(output.mx.labels).toContain('src:mcp');
    expect(output.mx.labels).not.toContain('untrusted');

    const recipient = await accessNamedField(output, 'recipient');
    expect(isStructuredValue(recipient)).toBe(true);
    expect(recipient.mx.labels).toContain('fact:@transaction.recipient');
    expect(recipient.mx.labels).toContain('src:mcp');
    expect(recipient.mx.labels).not.toContain('untrusted');

    const subject = await accessNamedField(output, 'subject');
    expect(isStructuredValue(subject)).toBe(true);
    expect(subject.mx.labels).toContain('src:mcp');
    expect(subject.mx.labels).toContain('untrusted');
    expect(subject.mx.labels.some(label => label.startsWith('fact:'))).toBe(false);
  });

  it('keeps inherited untrusted on every field when validation demotes the record', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @task = {
  facts: [id: string],
  data: [priority: number],
  validate: "demote"
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: { id: 'task-1', priority: 'high' },
      env,
      inheritedDescriptor: makeSecurityDescriptor({
        labels: ['untrusted', 'src:mcp']
      })
    });

    const idValue = await accessNamedField(output, 'id');
    expect(isStructuredValue(idValue)).toBe(true);
    expect(idValue.mx.labels).toContain('src:mcp');
    expect(idValue.mx.labels).toContain('untrusted');
    expect(idValue.mx.labels.some(label => label.startsWith('fact:'))).toBe(false);
  });

  it('keeps inherited untrusted when a when-clause demotes the record to data', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string],
  when [
    verified => :verified
    * => data
  ]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: { email: 'ada@example.com', verified: false },
      env,
      inheritedDescriptor: makeSecurityDescriptor({
        labels: ['untrusted']
      })
    });

    const email = await accessNamedField(output, 'email');
    expect(isStructuredValue(email)).toBe(true);
    expect(email.mx.labels).toContain('untrusted');
    expect(email.mx.labels.some(label => label.startsWith('fact:'))).toBe(false);
  });

  it('demotes invalid records to data while preserving factsources', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @task = {
  facts: [id: string],
  data: [priority: number],
  validate: "demote"
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: { id: 'task-1', priority: 'high' },
      env
    });

    expect(output.mx.schema?.valid).toBe(false);
    expect(output.mx.schema?.errors).toHaveLength(1);

    const idValue = await accessNamedField(output, 'id');
    expect(isStructuredValue(idValue)).toBe(true);
    expect(idValue.mx.labels).toEqual([]);
    expect(idValue.mx.factsources?.map(handle => handle.ref)).toEqual(['@task.id']);
  });

  it('drops invalid fields in drop mode and throws in strict mode', async () => {
    const env = createEnvironment();
    const dropDefinition = await registerRecord(env, `
/record @task = {
  facts: [id: string],
  data: [priority: number],
  validate: "drop"
}
`);

    const dropped = await coerceRecordOutput({
      definition: dropDefinition,
      value: { id: 'task-1', priority: 'high' },
      env,
      inheritedDescriptor: makeSecurityDescriptor({
        labels: ['untrusted', 'src:mcp']
      })
    });
    expect(dropped.mx.schema?.valid).toBe(false);
    expect((dropped.data as Record<string, unknown>).priority).toBeUndefined();
    expect(dropped.mx.labels).toContain('src:mcp');
    expect(dropped.mx.labels).not.toContain('untrusted');

    const idValue = await accessNamedField(dropped, 'id');
    expect(isStructuredValue(idValue)).toBe(true);
    expect(idValue.mx.labels).toEqual(
      expect.arrayContaining(['fact:@task.id', 'src:mcp'])
    );
    expect(idValue.mx.labels).not.toContain('untrusted');

    const strictDefinition = await registerRecord(env, `
/record @strict_task = {
  facts: [id: string],
  data: [priority: number],
  validate: "strict"
}
`);

    await expect(
      coerceRecordOutput({
        definition: strictDefinition,
        value: { id: 'task-1', priority: 'high' },
        env
      })
    ).rejects.toThrow(/expected number/i);
  });
});
