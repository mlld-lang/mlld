import { afterEach, describe, expect, it } from 'vitest';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createFactSourceHandle } from '@core/types/handle';
import { makeSecurityDescriptor } from '@core/types/security';
import { wrapStructured } from '@interpreter/utils/structured-value';

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

function createFactValue(email: string, sourceRef = '@contact') {
  return wrapStructured(email, 'text', email, {
    security: makeSecurityDescriptor({
      labels: [`fact:${sourceRef}.email`]
    }),
    factsources: [
      createFactSourceHandle({
        sourceRef,
        field: 'email',
        instanceKey: 'c1'
      })
    ]
  });
}

describe('ambient @mx accessors', () => {
  const operationStack: Environment[] = [];

  afterEach(() => {
    while (operationStack.length > 0) {
      operationStack.pop()?.getContextManager().popOperation();
    }
  });

  it('filters @mx.handles to the current llm session', () => {
    const root = createEnvironment();
    const left = root.createChild();
    const right = root.createChild();

    setActiveLlmSession(left, 'session-left');
    setActiveLlmSession(right, 'session-right');

    const leftIssued = left.issueHandle(createFactValue('ada@example.com'));
    const rightIssued = right.issueHandle(createFactValue('grace@example.com', '@contact_b'));

    const leftMx = left.getVariable('mx')?.value as any;
    const rightMx = right.getVariable('mx')?.value as any;

    expect(Object.keys(leftMx.handles)).toEqual([leftIssued.handle]);
    expect(Object.keys(rightMx.handles)).toEqual([rightIssued.handle]);
    expect(leftMx.handles[leftIssued.handle]).toMatchObject({
      value: 'ada@example.com',
      labels: ['fact:@contact.email'],
      factsource: {
        sourceRef: '@contact',
        field: 'email',
        instanceKey: 'c1'
      }
    });
    expect(leftMx.handles[leftIssued.handle].issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(leftMx.handles[rightIssued.handle]).toBeUndefined();
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
