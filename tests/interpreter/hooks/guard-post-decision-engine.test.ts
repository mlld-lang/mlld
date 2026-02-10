import { describe, expect, it } from 'vitest';
import type { GuardDefinition } from '@interpreter/guards';
import type { GuardHint } from '@core/types/guard';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { runPostGuardDecisionEngine } from '@interpreter/hooks/guard-post-decision-engine';
import type { PerInputCandidate } from '@interpreter/hooks/guard-candidate-selection';

const VARIABLE_SOURCE = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createVariable(name: string, value: string, labels: string[] = []) {
  return createSimpleTextVariable(
    name,
    value,
    VARIABLE_SOURCE,
    {
      security: makeSecurityDescriptor({
        labels,
        sources: [`source:${name}`]
      })
    }
  );
}

function createGuard(id: string): GuardDefinition {
  return {
    id,
    name: id,
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
    timing: 'after'
  };
}

function createCandidate(variableName: string, guards: GuardDefinition[]): PerInputCandidate {
  const variable = createVariable(variableName, `${variableName}-value`, ['seed']);
  return {
    index: 0,
    variable,
    labels: variable.mx?.labels ?? [],
    sources: variable.mx?.sources ?? [],
    taint: variable.mx?.taint ?? [],
    guards
  };
}

function createHint(guardName: string, hint: string): GuardHint {
  return { guardName, hint };
}

function buildOperationSnapshot(inputs: ReturnType<typeof createVariable>[]) {
  const labels = Array.from(new Set(inputs.flatMap(input => input.mx?.labels ?? [])));
  const sources = Array.from(new Set(inputs.flatMap(input => input.mx?.sources ?? [])));
  return {
    labels,
    sources,
    variables: inputs
  };
}

describe('guard post decision engine', () => {
  it('preserves deny precedence when deny-after-allow and retry-after-allow both match', async () => {
    const output = createVariable('output', 'seed-value', ['seed']);
    const transformed = createVariable('transformed', 'masked-value', ['masked']);
    const perInputGuards = [
      createGuard('allow-transform'),
      createGuard('deny-after'),
      createGuard('retry-after')
    ];

    const result = await runPostGuardDecisionEngine({
      perInputCandidates: [createCandidate('input', perInputGuards)],
      operationGuards: [],
      outputVariables: [output],
      activeOutputs: [output],
      currentDescriptor: makeSecurityDescriptor({
        labels: ['base'],
        sources: ['source:base']
      }),
      baseOutputValue: 'seed-value',
      retryContext: { attempt: 1, tries: [], hintHistory: [], max: 3 },
      evaluateGuard: async ({ guard }) => {
        if (guard.id === 'allow-transform') {
          return { guardName: guard.name ?? null, decision: 'allow', replacement: transformed };
        }
        if (guard.id === 'deny-after') {
          return {
            guardName: guard.name ?? null,
            decision: 'deny',
            reason: 'deny-after-allow',
            hint: createHint('deny-after', 'deny-hint')
          };
        }
        return {
          guardName: guard.name ?? null,
          decision: 'retry',
          reason: 'retry-after-allow',
          hint: createHint('retry-after', 'retry-hint')
        };
      },
      buildInputHelper: () => undefined,
      buildOperationSnapshot,
      resolveGuardValue: variable => variable?.value,
      buildVariablePreview: variable => String(variable.value),
      logLabelModifications: async () => {}
    });

    expect(result.decision).toBe('deny');
    expect(result.reasons).toEqual(['deny-after-allow']);
    expect(result.hints.map(hint => hint.hint)).toEqual(['deny-hint', 'retry-hint']);
    expect(result.transformsApplied).toBe(true);
  });

  it('keeps retry-after-allow semantics when no deny decision appears', async () => {
    const output = createVariable('output', 'seed-value', ['seed']);
    const transformed = createVariable('transformed', 'masked-value', ['masked']);
    const perInputGuards = [createGuard('allow-transform'), createGuard('retry-after')];

    const result = await runPostGuardDecisionEngine({
      perInputCandidates: [createCandidate('input', perInputGuards)],
      operationGuards: [],
      outputVariables: [output],
      activeOutputs: [output],
      currentDescriptor: makeSecurityDescriptor({
        labels: ['base'],
        sources: ['source:base']
      }),
      baseOutputValue: 'seed-value',
      retryContext: { attempt: 1, tries: [], hintHistory: [], max: 3 },
      evaluateGuard: async ({ guard }) => {
        if (guard.id === 'allow-transform') {
          return { guardName: guard.name ?? null, decision: 'allow', replacement: transformed };
        }
        return {
          guardName: guard.name ?? null,
          decision: 'retry',
          reason: 'retry-after-allow',
          hint: createHint('retry-after', 'retry-hint')
        };
      },
      buildInputHelper: () => undefined,
      buildOperationSnapshot,
      resolveGuardValue: variable => variable?.value,
      buildVariablePreview: variable => String(variable.value),
      logLabelModifications: async () => {}
    });

    expect(result.decision).toBe('retry');
    expect(result.reasons).toEqual(['retry-after-allow']);
    expect(result.hints.map(hint => hint.hint)).toEqual(['retry-hint']);
    expect(result.transformsApplied).toBe(true);
  });

  it('lets transformed output participate in later per-operation decisions with stable ordering', async () => {
    const output = createVariable('output', 'seed-value', ['seed']);
    const transformed = createVariable('transformed', 'masked-value', ['masked']);
    const callOrder: string[] = [];
    const outputValues: unknown[] = [];

    const result = await runPostGuardDecisionEngine({
      perInputCandidates: [createCandidate('input', [createGuard('allow-transform')])],
      operationGuards: [createGuard('op-check')],
      outputVariables: [output],
      activeOutputs: [output],
      currentDescriptor: makeSecurityDescriptor({
        labels: ['base'],
        sources: ['source:base']
      }),
      baseOutputValue: 'seed-value',
      retryContext: { attempt: 1, tries: [], hintHistory: [], max: 3 },
      evaluateGuard: async ({ guard, scope, outputRaw }) => {
        callOrder.push(`${scope}:${guard.id}`);
        outputValues.push(outputRaw);
        if (guard.id === 'allow-transform') {
          return { guardName: guard.name ?? null, decision: 'allow', replacement: transformed };
        }
        return {
          guardName: guard.name ?? null,
          decision: 'deny',
          reason: outputRaw === 'masked-value' ? 'operation-saw-transformed' : 'unexpected-output'
        };
      },
      buildInputHelper: () => undefined,
      buildOperationSnapshot,
      resolveGuardValue: variable => variable?.value,
      buildVariablePreview: variable => String(variable.value),
      logLabelModifications: async () => {}
    });

    expect(callOrder).toEqual(['perInput:allow-transform', 'perOperation:op-check']);
    expect(outputValues).toEqual(['seed-value', 'masked-value']);
    expect(result.decision).toBe('deny');
    expect(result.reasons).toEqual(['operation-saw-transformed']);
  });

  it('preserves reason and hint aggregation order across per-input and per-operation loops', async () => {
    const output = createVariable('output', 'seed-value', ['seed']);

    const result = await runPostGuardDecisionEngine({
      perInputCandidates: [createCandidate('input', [createGuard('retry-input')])],
      operationGuards: [createGuard('retry-operation')],
      outputVariables: [output],
      activeOutputs: [output],
      currentDescriptor: makeSecurityDescriptor({
        labels: ['base'],
        sources: ['source:base']
      }),
      baseOutputValue: 'seed-value',
      retryContext: { attempt: 1, tries: [], hintHistory: [], max: 3 },
      evaluateGuard: async ({ guard }) => {
        if (guard.id === 'retry-input') {
          return {
            guardName: guard.name ?? null,
            decision: 'retry',
            reason: 'input-retry',
            hint: createHint('retry-input', 'input-hint')
          };
        }
        return {
          guardName: guard.name ?? null,
          decision: 'retry',
          reason: 'operation-retry',
          hint: createHint('retry-operation', 'operation-hint')
        };
      },
      buildInputHelper: () => undefined,
      buildOperationSnapshot,
      resolveGuardValue: variable => variable?.value,
      buildVariablePreview: variable => String(variable.value),
      logLabelModifications: async () => {}
    });

    expect(result.decision).toBe('retry');
    expect(result.reasons).toEqual(['input-retry', 'operation-retry']);
    expect(result.hints.map(hint => hint.hint)).toEqual(['input-hint', 'operation-hint']);
  });
});
