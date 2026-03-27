import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { Environment } from '@interpreter/env/Environment';
import { PathService } from '@services/fs/PathService';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import type { RecordDirectiveNode } from '@core/types/record';
import type { ToolCollection } from '@core/types/tools';
import { evaluateRecord } from '@interpreter/eval/record';
import { evaluateDirective } from '@interpreter/eval/directive';
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

async function registerExe(env: Environment, source: string) {
  const directive = parseSync(source)[0] as any;
  await evaluateDirective(directive, env);
}

function setScopedTools(env: Environment, tools: ToolCollection, options?: { display?: 'strict' }) {
  env.setScopedEnvironmentConfig({
    ...(options?.display ? { display: options.display } : {}),
    tools
  });
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

  it('renders recipient and sender masks with type-aware previews', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @transaction = {
  facts: [recipient: string, sender: string],
  data: [subject: string],
  display: [{ mask: "recipient" }, { mask: "sender" }]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        recipient: 'SE3550000000054910000003',
        sender: 'Alice',
        subject: 'Monthly rent'
      },
      env
    });

    const projected = await renderDisplayProjection(output, env);
    expect(projected).toEqual({
      recipient: {
        preview: 'SE3***00003',
        handle: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      sender: {
        preview: 'A****',
        handle: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      subject: 'Monthly rent'
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

  it('records emitted projection aliases for the active llm tool session', async () => {
    const env = createEnvironment();
    env.setLlmToolConfig({
      sessionId: 'session-projection-test',
      mcpConfigPath: '',
      toolsCsv: '',
      mcpAllowedTools: '',
      nativeAllowedTools: '',
      unifiedAllowedTools: '',
      availableTools: [],
      inBox: false,
      cleanup: async () => {}
    });
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

    await renderDisplayProjection(output, env);

    const exposures = env.getProjectionExposures('session-projection-test');
    expect(exposures).toHaveLength(3);
    expect(exposures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionId: 'session-projection-test',
          kind: 'bare',
          field: 'name',
          record: 'contact',
          emittedLiteral: 'Ada Lovelace'
        }),
        expect.objectContaining({
          sessionId: 'session-projection-test',
          kind: 'mask',
          field: 'email',
          record: 'contact',
          emittedPreview: 'a***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }),
        expect.objectContaining({
          sessionId: 'session-projection-test',
          kind: 'handle',
          field: 'phone',
          record: 'contact',
          handle: expect.stringMatching(HANDLE_RE)
        })
      ])
    );
  });

  it('suppresses non-qualifying handles when active tool policy requires stronger fact proof', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  display: [name, { mask: "email" }]
}
`);
    await registerExe(
      env,
      '/exe exfil:send, tool:w @send_email(recipient, subject, body) = `sent` with { controlArgs: ["recipient"] }'
    );

    env.setPolicySummary({
      defaults: { rules: ['no-send-to-external'] },
      operations: { 'exfil:send': ['tool:w'] }
    } as any);
    setScopedTools(env, {
      send_email: { mlld: 'send_email', controlArgs: ['recipient'] }
    });

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada Lovelace'
      },
      env
    });

    expect(await renderDisplayProjection(output, env)).toEqual({
      name: 'Ada Lovelace',
      email: {
        preview: 'a***@example.com'
      }
    });
  });

  it('forces all fact fields to handle-only when display strict mode is active', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: [name, { mask: "email" }]
}
`);
    setScopedTools(env, {}, { display: 'strict' });

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
      email: {
        handle: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      name: {
        handle: {
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      notes: 'Visible'
    });
  });
});
