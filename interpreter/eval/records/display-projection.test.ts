import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import type { RecordDirectiveNode } from '@core/types/record';
import { evaluateRecord } from '@interpreter/eval/record';
import { coerceRecordOutput } from './coerce-record';
import { renderDisplayProjection } from './display-projection';
import { accessField } from '@interpreter/utils/field-access';
import { asText, isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';

const HANDLE_RE = /^h_[a-z0-9]{6}$/;

function createEnvironment(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  env.setCurrentFilePath('/project/display-projection.mld');
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

describe('renderDisplayProjection', () => {
  it('renders bare, masked, and handle-only fields with nested handle wrappers', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string, phone: string?],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        phone: '+1-555-0142',
        notes: 'Met at conference'
      },
      env
    });

    const projected = await renderDisplayProjection(output, env);
    expect(projected).toEqual({
      name: 'Ada Lovelace',
      email: {
        preview: 'a***@example.com',
        handle: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      phone: {
        handle: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      notes: 'Met at conference'
    });
  });

  it('keeps omitted display records fully bare', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        notes: 'Visible'
      },
      env
    });

    expect(await renderDisplayProjection(output, env)).toEqual({
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      notes: 'Visible'
    });
  });

  it('projects field-accessed values using field-level metadata', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  display: [name, { mask: "email" }]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada Lovelace'
      },
      env
    });

    const email = await accessField(output, { type: 'field', value: 'email' } as any, { env });
    const projected = await renderDisplayProjection(email, env);
    expect(projected).toEqual({
      preview: 'a***@example.com',
      handle: {
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
  });

  it('projects arrays of record results element-by-element', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  display: [name, { mask: "email" }]
}
`);

    const first = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada'
      },
      env
    });
    const second = await coerceRecordOutput({
      definition,
      value: {
        email: 'grace@example.com',
        name: 'Grace'
      },
      env
    });

    const wrapped = wrapStructured([first, second], 'array', JSON.stringify([first.data, second.data]));
    const projected = await renderDisplayProjection(wrapped, env);

    expect(projected).toEqual([
      {
        name: 'Ada',
        email: {
          preview: 'a***@example.com',
          handle: {
            handle: expect.stringMatching(HANDLE_RE)
          }
        }
      },
      {
        name: 'Grace',
        email: {
          preview: 'g***@example.com',
          handle: {
            handle: expect.stringMatching(HANDLE_RE)
          }
        }
      }
    ]);
  });

  it('keeps the inner nested handle wrapper compatible with existing resolution', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string],
  display: [{ mask: "email" }]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com'
      },
      env
    });

    const projected = await renderDisplayProjection(output, env) as {
      email: { preview: string; handle: { handle: string } };
    };
    const resolved = await resolveValueHandles(projected.email.handle, env);

    expect(isStructuredValue(resolved)).toBe(true);
    expect(asText(resolved)).toBe('ada@example.com');
  });
});
