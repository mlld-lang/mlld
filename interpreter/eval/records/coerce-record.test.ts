import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { Environment } from '@interpreter/env/Environment';
import type { RecordDirectiveNode } from '@core/types/record';
import { evaluateRecord } from '@interpreter/eval/record';
import { coerceRecordOutput } from './coerce-record';
import { accessField } from '@interpreter/utils/field-access';
import { isStructuredValue } from '@interpreter/utils/structured-value';

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

    const email = await accessNamedField(output, 'email');
    expect(isStructuredValue(email)).toBe(true);
    expect(email.mx.labels).toContain('fact:internal:@contact.email');
    expect(email.mx.factsources?.map(handle => handle.ref)).toEqual(['@contact.email']);

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
    const firstEmail = await accessNamedField(first, 'email');
    expect(isStructuredValue(firstEmail)).toBe(true);
    expect(firstEmail.text).toBe('a@example.com');
    expect(firstEmail.mx.labels).toContain('fact:@contact.email');
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
      env
    });
    expect(dropped.mx.schema?.valid).toBe(false);
    expect((dropped.data as Record<string, unknown>).priority).toBeUndefined();

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
