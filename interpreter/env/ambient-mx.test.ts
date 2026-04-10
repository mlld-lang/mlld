import { afterEach, describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { evaluateRecord } from '@interpreter/eval/record';
import { coerceRecordOutput } from '@interpreter/eval/records/coerce-record';
import { accessField } from '@interpreter/utils/field-access';
import type { RecordDirectiveNode } from '@core/types/record';

function createEnvironment(basePath = '/tmp/mlld-ambient-mx'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

function setActiveLlmSession(env: Environment, sessionId: string): void {
  env.setLlmToolConfig({
    sessionId,
    mcpConfigPath: '',
    toolsCsv: '',
    mcpAllowedTools: '',
    nativeAllowedTools: '',
    unifiedAllowedTools: '',
    availableTools: [],
    inBox: false,
    cleanup: async () => {}
  });
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
  if (!definition) {
    throw new Error(`Missing record definition @${directive.raw.identifier}`);
  }
  return definition;
}

describe('ambient @mx accessors', () => {
  const operationStack: Environment[] = [];

  afterEach(() => {
    while (operationStack.length > 0) {
      operationStack.pop()?.getContextManager().popOperation();
    }
  });

  it('filters grouped @mx.handles to the current llm session', async () => {
    const root = createEnvironment();
    const left = root.createChild();
    const right = root.createChild();
    const definition = await registerRecord(root, `
/record @contact = {
  facts: [email: string],
  data: [name: string]
}
`);

    setActiveLlmSession(left, 'session-left');
    setActiveLlmSession(right, 'session-right');

    const leftOutput = await coerceRecordOutput({
      definition,
      value: { email: 'ada@example.com', name: 'Ada' },
      env: left
    });
    const rightOutput = await coerceRecordOutput({
      definition,
      value: { email: 'grace@example.com', name: 'Grace' },
      env: right
    });

    const leftMxValue = await accessField(leftOutput, { type: 'field', value: 'mx' } as any, { env: left });
    const rightMxValue = await accessField(rightOutput, { type: 'field', value: 'mx' } as any, { env: right });

    const leftProjected = await accessField(leftMxValue, { type: 'field', value: 'handles' } as any, { env: left }) as any;
    const rightProjected = await accessField(rightMxValue, { type: 'field', value: 'handles' } as any, { env: right }) as any;

    const leftMx = left.getVariable('mx')?.value as any;
    const rightMx = right.getVariable('mx')?.value as any;

    expect(leftProjected.email.handle).toMatch(/^h_[a-z0-9]{6}$/);
    expect(leftProjected.name.handle).toMatch(/^h_[a-z0-9]{6}$/);
    expect(rightProjected.email.handle).toMatch(/^h_[a-z0-9]{6}$/);

    expect(leftMx.handles).toEqual([
      {
        record: '@contact',
        instance: {
          email: leftProjected.email,
          name: leftProjected.name
        }
      }
    ]);
    expect(rightMx.handles).toEqual([
      {
        record: '@contact',
        instance: {
          email: rightProjected.email,
          name: rightProjected.name
        }
      }
    ]);
    expect(leftMx.handles).not.toEqual(rightMx.handles);
  });

  it('exposes filtered and unfiltered grouped ambient handles by active role', async () => {
    const env = createEnvironment();
    const definition = await registerRecord(env, `
/record @email = {
  facts: [from: string],
  data: [subject: string, body: string],
  display: {
    role:planner: [subject, { ref: "from" }],
    role:worker: [{ mask: "from" }, subject, body]
  }
}
`);

    setActiveLlmSession(env, 'session-grouped-handles');
    env.setExeLabels(['llm', 'role:worker']);

    const output = await coerceRecordOutput({
      definition,
      value: {
        from: 'ada@example.com',
        subject: 'Update',
        body: 'Workers can inspect this'
      },
      env
    });

    const mxValue = await accessField(output, { type: 'field', value: 'mx' } as any, { env });
    await accessField(mxValue, { type: 'field', value: 'handles' } as any, { env });

    env.setExeLabels(['llm', 'role:planner']);
    const ambientMx = env.getVariable('mx')?.value as any;

    expect(ambientMx.handles).toEqual([
      {
        record: '@email',
        instance: {
          from: {
            value: 'ada@example.com',
            handle: expect.stringMatching(/^h_[a-z0-9]{6}$/)
          },
          subject: {
            value: 'Update',
            handle: expect.stringMatching(/^h_[a-z0-9]{6}$/)
          }
        }
      }
    ]);

    expect(ambientMx.handles.unfiltered).toEqual([
      {
        record: '@email',
        instance: {
          from: {
            value: 'ada@example.com',
            handle: expect.stringMatching(/^h_[a-z0-9]{6}$/)
          },
          subject: {
            value: 'Update',
            handle: expect.stringMatching(/^h_[a-z0-9]{6}$/)
          },
          body: {
            value: 'Workers can inspect this',
            handle: expect.stringMatching(/^h_[a-z0-9]{6}$/)
          }
        }
      }
    ]);
  });

  it('exposes llm session, display, and resume metadata', () => {
    const idleMx = createEnvironment().getVariable('mx')?.value as any;
    expect(idleMx.llm.sessionId).toBeNull();
    expect(idleMx.llm.display).toBeNull();
    expect(idleMx.llm.resume).toBeNull();

    const env = createEnvironment();
    setActiveLlmSession(env, 'bridge-session');
    env.setScopedEnvironmentConfig({ display: 'planner' });
    env.getContextManager().pushOperation({
      type: 'exe',
      name: 'agent',
      metadata: {
        llmResumeState: {
          sessionId: 'resume-session',
          provider: 'fake',
          continuationOf: 'resume-session',
          attempt: 2
        }
      }
    });
    operationStack.push(env);

    const mx = env.getVariable('mx')?.value as any;

    expect(mx.llm).toMatchObject({
      sessionId: 'bridge-session',
      display: 'planner',
      resume: {
        sessionId: 'resume-session',
        provider: 'fake',
        continuationOf: 'resume-session',
        attempt: 2
      }
    });
  });

  it('derives ambient llm display from exe role labels and lets scoped display override it', () => {
    const env = createEnvironment();
    setActiveLlmSession(env, 'bridge-session');
    env.setExeLabels(['llm', 'role:planner']);

    expect((env.getVariable('mx')?.value as any).llm.display).toBe('role:planner');

    env.setScopedEnvironmentConfig({ display: 'role:worker' });
    expect((env.getVariable('mx')?.value as any).llm.display).toBe('role:worker');
  });

  it('exposes shelf readable and writable metadata for the current scope', () => {
    const env = createEnvironment();
    env.registerRecordDefinition('contact', {
      name: 'contact',
      fields: [],
      facts: [],
      data: [],
      display: { kind: 'open' }
    } as any);
    env.registerShelfDefinition('state', {
      name: 'state',
      slots: {
        selected: {
          name: 'selected',
          record: 'contact',
          cardinality: 'singular',
          optional: true,
          merge: 'replace'
        },
        audit_log: {
          name: 'audit_log',
          record: 'contact',
          cardinality: 'collection',
          optional: false,
          merge: 'append'
        }
      }
    });
    env.setScopedEnvironmentConfig({
      shelf: {
        __mlldShelfScope: true,
        readSlots: [
          { shelfName: 'state', slotName: 'selected' },
          { shelfName: 'state', slotName: 'audit_log' }
        ],
        writeSlots: [{ shelfName: 'state', slotName: 'audit_log' }],
        readAliases: {},
        readSlotBindings: [
          { ref: { shelfName: 'state', slotName: 'selected' }, alias: 'selected' },
          { ref: { shelfName: 'state', slotName: 'audit_log' }, alias: 'log' }
        ],
        writeSlotBindings: [{ ref: { shelfName: 'state', slotName: 'audit_log' }, alias: 'log' }]
      } as any
    });

    const mx = env.getVariable('mx')?.value as any;

    expect(mx.shelf.writable).toEqual([
      {
        alias: 'log',
        slotRef: '@state.audit_log',
        recordType: '@contact',
        merge: 'append'
      }
    ]);
    expect(mx.shelf.readable).toEqual([
      {
        alias: 'selected',
        slotRef: '@state.selected',
        recordType: '@contact',
        merge: 'replace'
      },
      {
        alias: 'log',
        slotRef: '@state.audit_log',
        recordType: '@contact',
        merge: 'append'
      }
    ]);
  });

  it('exposes active policy descriptors and keeps activePolicies available', () => {
    const env = createEnvironment();
    env.setPolicyContext({
      tier: 'strict',
      configs: {
        locked: true
      },
      activePolicies: ['base', 'audit']
    });

    const mx = env.getVariable('mx')?.value as any;

    expect(mx.policy.activePolicies).toEqual(['base', 'audit']);
    expect(mx.policy.active).toEqual([
      { name: 'base', locked: true, source: 'base' },
      { name: 'audit', locked: true, source: 'audit' }
    ]);
  });
});
