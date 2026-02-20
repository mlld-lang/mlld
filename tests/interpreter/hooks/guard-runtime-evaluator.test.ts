import { describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import type { GuardDefinition } from '@interpreter/guards';
import type { GuardActionNode } from '@core/types/guard';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  evaluateGuardRuntime,
  type EvaluateGuardRuntimeDependencies,
  type EvaluateGuardRuntimeOptions
} from '@interpreter/hooks/guard-runtime-evaluator';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createGuard(overrides: Partial<GuardDefinition> = {}): GuardDefinition {
  return {
    id: 'guard-id',
    name: 'guardName',
    filterKind: 'data',
    filterValue: 'secret',
    scope: 'perInput',
    modifier: 'default',
    block: {
      type: 'GuardBlock',
      modifier: 'default',
      rules: [],
      location: null
    },
    registrationOrder: 1,
    timing: 'before',
    ...overrides
  };
}

function createInput(name: string, value = 'visible', labels: string[] = []): any {
  return createSimpleTextVariable(
    name,
    value,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({ labels, sources: [`source:${name}`] })
    }
  );
}

function createAction(decision: GuardActionNode['decision'], message?: string): GuardActionNode {
  return {
    type: 'GuardAction',
    decision,
    message,
    location: null
  } as GuardActionNode;
}

function createOptions(overrides: Partial<EvaluateGuardRuntimeOptions> = {}): EvaluateGuardRuntimeOptions {
  const env = overrides.env ?? createEnv();
  const input = createInput('input');
  return {
    node: { kind: 'show' } as any,
    env,
    guard: createGuard(),
    operation: {
      type: 'show',
      name: 'preview',
      opLabels: ['public'],
      labels: ['public']
    },
    scope: 'perInput',
    perInput: {
      index: 0,
      variable: input,
      labels: [],
      sources: ['source:input'],
      taint: [],
      guards: []
    },
    attemptNumber: 1,
    attemptHistory: [],
    attemptKey: 'attempt-key',
    attemptStore: new Map(),
    ...overrides
  };
}

function createDeps(
  overrides: Partial<EvaluateGuardRuntimeDependencies> = {}
): EvaluateGuardRuntimeDependencies {
  return {
    defaultGuardMax: 3,
    guardInputSource: {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    },
    prepareGuardEnvironment: () => {},
    injectGuardHelpers: () => {},
    evaluateGuardBlock: async () => undefined,
    evaluateGuardReplacement: async () => undefined,
    resolveGuardEnvConfig: async () => ({ mode: 'strict' }),
    buildDecisionMetadata: (action, _guard, extras) => ({
      reason: action.message ?? null,
      attempt: extras?.attempt ?? null,
      tries: extras?.tries?.map(entry => ({
        attempt: entry.attempt,
        decision: entry.decision,
        hint: entry.hint ?? null
      }))
    }),
    logGuardEvaluationStart: () => {},
    logGuardDecisionEvent: () => {},
    ...overrides
  };
}

describe('guard runtime evaluator', () => {
  it('covers a decision-path matrix for allow/deny/retry/env with stable result shapes', async () => {
    const replacement = createInput('replacement', 'replaced');
    const matrix: Array<{
      label: string;
      action: GuardActionNode | undefined;
      expectedDecision: 'allow' | 'deny' | 'retry' | 'env';
      expectedTopLevelKeys: string[];
      expectedMetadataKeys: string[];
      expectedReason?: string;
      expectedHint?: string;
    }> = [
      {
        label: 'allow',
        action: { ...createAction('allow'), warning: 'heads-up' } as any,
        expectedDecision: 'allow',
        expectedTopLevelKeys: ['decision', 'guardName', 'hint', 'metadata', 'replacement', 'timing'],
        expectedMetadataKeys: ['guardContext', 'guardFilter', 'guardInput', 'guardName', 'inputPreview', 'scope'],
        expectedHint: 'heads-up'
      },
      {
        label: 'deny',
        action: createAction('deny', 'blocked'),
        expectedDecision: 'deny',
        expectedTopLevelKeys: ['decision', 'guardName', 'metadata', 'reason', 'timing'],
        expectedMetadataKeys: ['attempt', 'reason', 'tries'],
        expectedReason: 'blocked'
      },
      {
        label: 'retry',
        action: createAction('retry', 'retry-me'),
        expectedDecision: 'retry',
        expectedTopLevelKeys: ['decision', 'guardName', 'hint', 'metadata', 'reason', 'timing'],
        expectedMetadataKeys: ['attempt', 'reason', 'tries'],
        expectedReason: 'retry-me',
        expectedHint: 'retry-me'
      },
      {
        label: 'env',
        action: createAction('env'),
        expectedDecision: 'env',
        expectedTopLevelKeys: ['decision', 'envConfig', 'guardName', 'metadata', 'timing'],
        expectedMetadataKeys: ['decision', 'envConfig', 'guardContext', 'guardFilter', 'guardInput', 'guardName', 'inputPreview', 'scope']
      }
    ];

    for (const entry of matrix) {
      const options = createOptions();
      const deps = createDeps({
        evaluateGuardBlock: async () => entry.action,
        evaluateGuardReplacement: async () => replacement
      });

      const result = await evaluateGuardRuntime(options, deps);
      expect(result.decision).toBe(entry.expectedDecision);
      expect(Object.keys(result).sort()).toEqual(entry.expectedTopLevelKeys.sort());
      expect(Object.keys(result.metadata ?? {}).sort()).toEqual(entry.expectedMetadataKeys.sort());

      if (entry.expectedReason) {
        expect(result.reason).toBe(entry.expectedReason);
      }
      if (entry.expectedHint) {
        expect((result.hint as any)?.hint).toBe(entry.expectedHint);
      }
    }
  });

  it('short-circuits on policy-condition deny without executing downstream actions', async () => {
    const evaluateGuardBlock = vi.fn(async () => createAction('allow'));
    const guard = createGuard({
      policyCondition: () => ({
        decision: 'deny',
        reason: 'policy-block',
        policyName: 'default',
        rule: 'r1',
        suggestions: ['fix']
      })
    });

    const result = await evaluateGuardRuntime(
      createOptions({
        guard,
        perInput: {
          index: 0,
          variable: createInput('secret', 'classified', ['secret']),
          labels: ['secret'],
          sources: ['source:secret'],
          taint: [],
          guards: []
        }
      }),
      createDeps({ evaluateGuardBlock })
    );

    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('policy-block');
    expect(result.metadata?.policyName).toBe('default');
    expect(evaluateGuardBlock).not.toHaveBeenCalled();
  });

  it('keeps retry-attempt metadata isolated across sequential attempts', async () => {
    const attemptStore = new Map();
    const optionsBase = createOptions({
      attemptStore,
      attemptKey: 'retry-key'
    });
    const deps = createDeps({
      evaluateGuardBlock: async () => createAction('retry', 'retry-once')
    });

    const first = await evaluateGuardRuntime(
      {
        ...optionsBase,
        attemptNumber: 1,
        attemptHistory: []
      },
      deps
    );

    const stateAfterFirst = attemptStore.get('retry-key');
    expect(stateAfterFirst?.nextAttempt).toBe(2);
    expect(stateAfterFirst?.history).toHaveLength(1);
    expect((first.metadata as any).tries).toEqual([{ attempt: 1, decision: 'retry', hint: 'retry-once' }]);

    const second = await evaluateGuardRuntime(
      {
        ...optionsBase,
        attemptNumber: stateAfterFirst?.nextAttempt ?? 2,
        attemptHistory: stateAfterFirst?.history.slice() ?? []
      },
      deps
    );

    const stateAfterSecond = attemptStore.get('retry-key');
    expect(stateAfterSecond?.nextAttempt).toBe(3);
    expect(stateAfterSecond?.history).toHaveLength(2);
    expect((first.metadata as any).tries).toHaveLength(1);
    expect((second.metadata as any).tries).toHaveLength(2);
  });
});
