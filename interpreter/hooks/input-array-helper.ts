import type { Variable } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import type { VariableContextSnapshot } from '@core/types/variable/VariableTypes';
import { VariableMetadataUtils } from '@core/types/variable/VariableMetadata';

type QuantifierType = 'any' | 'all' | 'none';

interface QuantifierLabelsHelper {
  includes(label: DataLabel): boolean;
}

interface QuantifierTokensHelper {
  some(predicate: (token: number) => boolean): boolean;
  greaterThan(value: number): boolean;
}

interface QuantifierContextHelper {
  labels: QuantifierLabelsHelper;
  tokens: QuantifierTokensHelper;
}

interface QuantifierHelper {
  ctx: QuantifierContextHelper;
}

export interface GuardInputHelper {
  raw: readonly Variable[];
  ctx: {
    labels: readonly DataLabel[];
    tokens: number[];
    sources: readonly string[];
    totalTokens(): number;
    maxTokens(): number;
  };
  totalTokens(): number;
  maxTokens(): number;
  any: QuantifierHelper;
  all: QuantifierHelper;
  none: QuantifierHelper;
}

export function createGuardInputHelper(inputs: readonly Variable[]): GuardInputHelper {
  const contexts = inputs.map(variable => ensureContext(variable));
  const tokens = contexts.map(ctx => ctx.tokens ?? ctx.tokest ?? 0);
  const labelsUnion = Array.from(new Set(contexts.flatMap(ctx => ctx.labels ?? [])));
  const sourceUnion = Array.from(new Set(contexts.flatMap(ctx => ctx.sources ?? [])));

  const totalTokens = (): number => tokens.reduce((sum, value) => sum + (value || 0), 0);
  const maxTokens = (): number => tokens.reduce((max, value) => Math.max(max, value || 0), 0);

  return {
    raw: inputs,
    ctx: {
      labels: labelsUnion,
      tokens,
      sources: sourceUnion,
      totalTokens,
      maxTokens
    },
    totalTokens,
    maxTokens,
    any: createQuantifierHelper('any', contexts),
    all: createQuantifierHelper('all', contexts),
    none: createQuantifierHelper('none', contexts)
  };
}

function createQuantifierHelper(
  type: QuantifierType,
  contexts: VariableContextSnapshot[]
): QuantifierHelper {
  const evaluate = (predicate: (ctx: VariableContextSnapshot) => boolean): boolean => {
    switch (type) {
      case 'any':
        return contexts.some(predicate);
      case 'all':
        return contexts.every(predicate);
      case 'none':
        return contexts.every(ctx => !predicate(ctx));
    }
  };

  return {
    ctx: {
      labels: {
        includes(label: DataLabel): boolean {
          return evaluate(ctx => (ctx.labels ?? []).includes(label));
        }
      },
      tokens: {
        some(predicate: (token: number) => boolean): boolean {
          return evaluate(ctx => predicate(ctx.tokens ?? ctx.tokest ?? 0));
        },
        greaterThan(value: number): boolean {
          return evaluate(ctx => (ctx.tokens ?? ctx.tokest ?? 0) > value);
        }
      }
    }
  };
}

function ensureContext(variable: Variable): VariableContextSnapshot {
  if (!('ctx' in variable) || !variable.ctx) {
    VariableMetadataUtils.attachContext(variable);
  }
  return variable.ctx as VariableContextSnapshot;
}
