import { describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import type { GuardDefinition } from '@interpreter/guards';
import type { GuardActionNode } from '@core/types/guard';
import { MlldWhenExpressionError } from '@core/errors';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  evaluatePostGuardRuntime,
  type EvaluatePostGuardRuntimeDependencies,
  type EvaluatePostGuardRuntimeOptions
} from '@interpreter/hooks/guard-post-runtime-evaluator';

const VARIABLE_SOURCE = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

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
    timing: 'after',
    ...overrides
  };
}

function createInput(name: string, value = 'visible', labels: string[] = []): Variable {
  return createSimpleTextVariable(
    name,
    value,
    VARIABLE_SOURCE,
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

function createOptions(
  overrides: Partial<EvaluatePostGuardRuntimeOptions> = {}
): EvaluatePostGuardRuntimeOptions {
  const env = overrides.env ?? createEnv();
  const input = createInput('input');
  return {
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
      labels: ['secret'],
      sources: ['source:input'],
      taint: [],
      guards: []
    },
    attemptNumber: 1,
    attemptHistory: [],
    ...overrides
  };
}

function createDeps(
  overrides: Partial<EvaluatePostGuardRuntimeDependencies> = {}
): EvaluatePostGuardRuntimeDependencies {
  return {
    guardInputSource: {
      directive: 'var',
      syntax: 'object',
      hasInterpolation: false,
      isMultiLine: false
    },
    prepareGuardEnvironment: () => {},
    injectGuardHelpers: () => {},
    attachGuardInputHelper: () => {},
    cloneVariable: variable => ({
      ...variable,
      mx: {
        ...(variable.mx ?? {})
      },
      internal: {
        ...(variable.internal ?? {})
      }
    }),
    resolveGuardValue: variable => (variable as any)?.value,
    buildVariablePreview: variable => String((variable as any)?.value ?? ''),
    replacementDependencies: {
      cloneVariableWithDescriptor: variable => ({
        ...variable,
        mx: {
          ...(variable.mx ?? {})
        },
        internal: {
          ...(variable.internal ?? {})
        }
      })
    },
    evaluateGuardBlock: async () => undefined,
    evaluateGuardReplacement: async () => undefined,
    ...overrides
  };
}

describe('guard post runtime evaluator', () => {
  it('preserves after-timing allow/deny/retry decisions with stable payload shapes', async () => {
    const replacement = createInput('replacement', 'sanitized');
    const matrix: Array<{
      label: string;
      action: GuardActionNode;
      expectedDecision: 'allow' | 'deny' | 'retry';
      expectedReason?: string;
      expectedHint?: string;
      expectReplacement?: boolean;
    }> = [
      {
        label: 'allow',
        action: {
          ...createAction('allow'),
          warning: 'heads-up'
        } as GuardActionNode,
        expectedDecision: 'allow',
        expectedHint: 'heads-up',
        expectReplacement: true
      },
      {
        label: 'deny',
        action: createAction('deny', 'blocked-output'),
        expectedDecision: 'deny',
        expectedReason: 'blocked-output'
      },
      {
        label: 'retry',
        action: createAction('retry', 'try-again'),
        expectedDecision: 'retry',
        expectedReason: 'try-again',
        expectedHint: 'try-again'
      }
    ];

    for (const entry of matrix) {
      const options = createOptions();
      const deps = createDeps({
        evaluateGuardBlock: async () => entry.action,
        evaluateGuardReplacement: async () => replacement
      });

      const result = await evaluatePostGuardRuntime(options, deps);
      expect(result.decision, `${entry.label} decision`).toBe(entry.expectedDecision);
      expect(result.timing, `${entry.label} timing`).toBe('after');
      expect(result.metadata?.timing, `${entry.label} metadata timing`).toBe('after');

      if (entry.expectedReason) {
        expect(result.reason, `${entry.label} reason`).toBe(entry.expectedReason);
      }
      if (entry.expectedHint) {
        expect((result.hint as any)?.hint, `${entry.label} hint`).toBe(entry.expectedHint);
      }
      if (entry.expectReplacement) {
        expect(result.replacement, `${entry.label} replacement`).toBe(replacement);
      }
    }
  });

  it('throws MlldWhenExpressionError for env actions in after timing', async () => {
    const options = createOptions();
    const deps = createDeps({
      evaluateGuardBlock: async () => createAction('env')
    });

    await expect(evaluatePostGuardRuntime(options, deps)).rejects.toBeInstanceOf(
      MlldWhenExpressionError
    );
    await expect(evaluatePostGuardRuntime(options, deps)).rejects.toThrow(
      'Guard env actions apply only before execution'
    );
  });
});
