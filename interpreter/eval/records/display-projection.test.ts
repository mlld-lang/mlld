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

function setScopedTools(env: Environment, tools: ToolCollection, options?: { display?: string }) {
  env.setScopedEnvironmentConfig({
    ...(options?.display ? { display: options.display } : {}),
    tools
  });
}

describe('renderDisplayProjection', () => {
  it('renders bare, masked, and handle-only fields with flat handle payloads', async () => {
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
        handle: expect.stringMatching(HANDLE_RE)
      },
    });
  });

  it('projects omitted-display fact fields as refs while leaving data fields bare', async () => {
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
      email: {
        value: 'ada@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      },
      name: {
        value: 'Ada Lovelace',
        handle: expect.stringMatching(HANDLE_RE)
      },
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
      handle: expect.stringMatching(HANDLE_RE)
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
        handle: expect.stringMatching(HANDLE_RE)
      },
      sender: {
        preview: 'A****',
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
          handle: expect.stringMatching(HANDLE_RE)
        }
      },
      {
        name: 'Grace',
        email: {
          preview: 'g***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      }
    ]);
  });

  it('keeps flat projection handles compatible with existing wrapper-based resolution', async () => {
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
      email: { preview: string; handle: string };
    };
    const resolved = await resolveValueHandles({ handle: projected.email.handle }, env);

    expect(isStructuredValue(resolved)).toBe(true);
    expect(asText(resolved)).toBe('ada@example.com');
  });

  it('stores safe previews on issued handles for displayed fact fields', async () => {
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

    const handles = env.getIssuedHandles();
    expect(handles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: expect.stringMatching(HANDLE_RE),
          preview: 'a***@example.com',
          metadata: expect.objectContaining({
            field: 'email',
            record: 'contact'
          })
        })
      ])
    );
  });

  it('emits runtime trace events for projection decisions in verbose mode', async () => {
    const env = createEnvironment();
    env.setRuntimeTrace('verbose');
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

    await renderDisplayProjection(output, env);

    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'display',
          event: 'display.project',
          data: expect.objectContaining({
            record: 'contact',
            field: 'email',
            mode: 'mask',
            handleIssued: true
          })
        })
      ])
    );
  });

  it('projects array fact fields element-by-element for bare, masked, and handle-only displays', async () => {
    const env = createEnvironment();
    env.setLlmToolConfig({
      sessionId: 'session-array-projection',
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
/record @calendar_evt = {
  facts: [participants: array, recipients: array, visible: array],
  data: [title: string],
  display: [visible, { mask: "participants" }]
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        participants: ['ada@example.com', 'grace@example.com'],
        recipients: ['ops@example.com', 'sales@example.com'],
        visible: ['alex@example.com', 'sam@example.com'],
        title: 'Lunch'
      },
      env
    });

    const projected = await renderDisplayProjection(output, env);
    expect(projected).toEqual({
      participants: [
        {
          preview: 'a***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        },
        {
          preview: 'g***@example.com',
          handle: expect.stringMatching(HANDLE_RE)
        }
      ],
      visible: ['alex@example.com', 'sam@example.com']
    });
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
        handle: expect.stringMatching(HANDLE_RE)
      },
      name: {
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
  });

  it('supports named display modes with worker/planner visibility splits', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @email = {
  facts: [from: string, message_id: string],
  data: [subject: string, body: string],
  display: {
    worker: [{ mask: "from" }, subject, body],
    planner: [{ ref: "from" }, { handle: "message_id" }]
  }
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        from: 'ada@example.com',
        message_id: 'msg-1',
        subject: 'Update',
        body: 'Body'
      },
      env
    });

    setScopedTools(env, {}, { display: 'worker' });
    expect(await renderDisplayProjection(output, env)).toEqual({
      from: {
        preview: 'a***@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      },
      subject: 'Update',
      body: 'Body'
    });

    setScopedTools(env, {}, { display: 'planner' });
    expect(await renderDisplayProjection(output, env)).toEqual({
      from: {
        value: 'ada@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      },
      message_id: {
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
  });

  it('uses default named display mode when no explicit box mode is selected', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string, name: string],
  display: {
    default: [name, { mask: "email" }],
    planner: [{ ref: "email" }]
  }
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: {
        email: 'ada@example.com',
        name: 'Ada'
      },
      env
    });

    expect(await renderDisplayProjection(output, env)).toEqual({
      name: 'Ada',
      email: {
        preview: 'a***@example.com',
        handle: expect.stringMatching(HANDLE_RE)
      }
    });
  });

  it('fails closed when a named display mode is not declared by the record', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string],
  display: {
    planner: [{ ref: "email" }]
  }
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: { email: 'ada@example.com' },
      env
    });

    setScopedTools(env, {}, { display: 'worker' });
    await expect(renderDisplayProjection(output, env)).rejects.toThrow(/does not declare display mode 'worker'/i);
  });

  it('fails closed when a named display record is rendered without an explicit or default mode', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @contact = {
  facts: [email: string],
  display: {
    planner: [{ ref: "email" }]
  }
}
`);

    const output = await coerceRecordOutput({
      definition,
      value: { email: 'ada@example.com' },
      env
    });

    await expect(renderDisplayProjection(output, env)).rejects.toThrow(/requires an explicit display mode/i);
  });

  it('degrades ref fields to visible-only values when policy filtering denies the handle', async () => {
    const env = createEnvironment();
    env.setLlmToolConfig({
      sessionId: 'session-ref-degrade',
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
  facts: [email: string, name: string],
  display: {
    planner: [name, { ref: "email" }]
  }
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
    }, { display: 'planner' });

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
        value: 'ada@example.com'
      }
    });

    expect(env.getIssuedHandles()).toEqual([]);
  });
});
