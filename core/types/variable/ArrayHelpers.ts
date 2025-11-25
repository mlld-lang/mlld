import type { DataLabel } from '../security';
import type {
  ArrayVariable,
  Variable,
  VariableContextSnapshot
} from './VariableTypes';
import { VariableMetadataUtils } from './VariableMetadata';
import { materializeExpressionValue } from '../provenance/ExpressionProvenance';

type QuantifierType = 'any' | 'all' | 'none';
const QUANTIFIER_EVALUATOR = '__mlldQuantifierEvaluator';

export interface QuantifierLabelsHelper {
  includes(label: DataLabel): boolean;
}

export interface QuantifierTokensHelper {
  some(predicate: (token: number) => boolean): boolean;
  greaterThan(value: number): boolean;
}

export interface QuantifierContextHelper {
  labels: QuantifierLabelsHelper;
  tokens: QuantifierTokensHelper;
}

export interface QuantifierHelper {
  ctx: QuantifierContextHelper;
}

export interface ArrayAggregateSnapshot {
  readonly contexts: VariableContextSnapshot[];
  readonly labels: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly tokens: readonly number[];
  totalTokens(): number;
  maxTokens(): number;
}

export interface GuardInputHelper {
  raw: readonly Variable[];
  ctx: {
    labels: readonly DataLabel[];
    tokens: readonly number[];
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

export interface ArrayAggregateOptions {
  nameHint?: string;
}

export function createGuardInputHelper(inputs: readonly Variable[]): GuardInputHelper {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_input__' });
  const quantifiers = createQuantifierHelpers(aggregate.contexts);
  return {
    raw: inputs,
    ctx: {
      labels: aggregate.labels,
      tokens: aggregate.tokens,
      sources: aggregate.sources,
      totalTokens: aggregate.totalTokens,
      maxTokens: aggregate.maxTokens
    },
    totalTokens: aggregate.totalTokens,
    maxTokens: aggregate.maxTokens,
    any: quantifiers.any,
    all: quantifiers.all,
    none: quantifiers.none
  };
}

export function attachArrayHelpers(variable: ArrayVariable): void {
  if ((variable as any).__arrayHelpersAttached) {
    return;
  }

  Object.defineProperty(variable, '__arrayHelpersAttached', {
    value: true,
    enumerable: false,
    configurable: false
  });

  const arrayValues = Array.isArray(variable.value) ? variable.value : [];
  const aggregate = buildArrayAggregate(arrayValues, {
    nameHint: variable.name ?? '__array_helper__'
  });
  const quantifiers = createQuantifierHelpers(aggregate.contexts);

  const helperTargets: unknown[] = [variable];
  if (Array.isArray(arrayValues)) {
    helperTargets.push(arrayValues);
  }

  for (const target of helperTargets) {
    defineHelperProperty(target, 'raw', arrayValues);
    defineHelperProperty(target, 'any', quantifiers.any);
    defineHelperProperty(target, 'all', quantifiers.all);
    defineHelperProperty(target, 'none', quantifiers.none);
    defineHelperProperty(target, 'totalTokens', aggregate.totalTokens);
    defineHelperProperty(target, 'maxTokens', aggregate.maxTokens);
  }

  if (!variable.internal) {
    variable.internal = {};
  }
  (variable.internal as any).arrayHelperAggregate = aggregate;

  // Update .ctx snapshot to include aggregate info for consumers and tests
  const ctx = ensureContext(variable);
  const hasAggregateContexts = aggregate.contexts.length > 0;

  if (hasAggregateContexts) {
    ctx.labels = aggregate.labels;
    ctx.sources = aggregate.sources;
    ctx.tokens = aggregate.tokens;
  } else if (!ctx.tokens) {
    ctx.tokens = aggregate.tokens;
  }

  ctx.totalTokens = aggregate.totalTokens;
  ctx.maxTokens = aggregate.maxTokens;
  if (Array.isArray(variable.value)) {
    ctx.size = variable.value.length;
  }
  if (variable.internal?.ctxCache) {
    variable.internal.ctxCache = ctx;
  }
}

export function buildArrayAggregate(
  values: readonly unknown[],
  options?: ArrayAggregateOptions
): ArrayAggregateSnapshot {
  const nameHint = options?.nameHint ?? '__array_helper__';
  const variables = values
    .map(value => {
      if (isVariableLike(value)) {
        return value as Variable;
      }
      return materializeExpressionValue(value, { name: nameHint });
    })
    .filter((value): value is Variable => Boolean(value));
  const contexts = variables.map(ensureContext);
  const tokenValues = contexts.map(ctx => ctx.tokens ?? ctx.tokest ?? 0);
  const tokens = Object.freeze(tokenValues.slice()) as readonly number[];
  const labels = freezeArray(
    contexts.flatMap(ctx => ctx.labels ?? [])
  );
  const sources = freezeArray(
    contexts.flatMap(ctx => ctx.sources ?? [])
  );

  const totalTokens = (): number =>
    tokenValues.reduce((sum, value) => sum + (value || 0), 0);
  const maxTokens = (): number =>
    tokenValues.reduce((max, value) => Math.max(max, value || 0), 0);

  return {
    contexts,
    labels,
    sources,
    tokens,
    totalTokens,
    maxTokens
  };
}

function createQuantifierHelpers(contexts: VariableContextSnapshot[]): {
  any: QuantifierHelper;
  all: QuantifierHelper;
  none: QuantifierHelper;
} {
  return {
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

  const labelsHelper: QuantifierLabelsHelper = {
    includes(label: DataLabel): boolean {
      return evaluate(ctx => (ctx.labels ?? []).includes(label));
    }
  };

  attachQuantifierEvaluator(labelsHelper, (method, args) => {
    if (method === 'includes') {
      const label = args[0] as DataLabel;
      return labelsHelper.includes(label);
    }
    return false;
  });

  const tokensHelper: QuantifierTokensHelper = {
    some(predicate: (token: number) => boolean): boolean {
      return evaluate(ctx => predicate(ctx.tokens ?? ctx.tokest ?? 0));
    },
    greaterThan(value: number): boolean {
      return evaluate(ctx => (ctx.tokens ?? ctx.tokest ?? 0) > value);
    }
  };

  attachQuantifierEvaluator(tokensHelper, (method, args) => {
    switch (method) {
      case 'some': {
        const predicate = args[0] as (token: number) => boolean;
        return tokensHelper.some(predicate);
      }
      case 'greaterThan': {
        const value = Number(args[0]);
        return tokensHelper.greaterThan(value);
      }
      default:
        return false;
    }
  });

  return {
    ctx: {
      labels: labelsHelper,
      tokens: tokensHelper
    }
  };
}

function ensureContext(variable: Variable): VariableContextSnapshot {
  if (!('ctx' in variable) || !variable.ctx) {
    VariableMetadataUtils.attachContext(variable);
  }
  return variable.ctx as VariableContextSnapshot;
}

function isVariableLike(value: unknown): value is Variable {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in (value as Record<string, unknown>) &&
    'value' in (value as Record<string, unknown>)
  );
}

function defineHelperProperty<T>(
  target: T,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true
  });
}

function freezeArray<T>(values: Iterable<T>): readonly T[] {
  return Object.freeze(Array.from(new Set(values)));
}

function attachQuantifierEvaluator(
  target: object,
  evaluator: (method: string, args: readonly unknown[]) => unknown
): void {
  Object.defineProperty(target, QUANTIFIER_EVALUATOR, {
    value: evaluator,
    enumerable: false,
    configurable: false
  });
}
