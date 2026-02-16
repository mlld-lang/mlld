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

export interface QuantifierTextHelper {
  includes(fragment: string): boolean;
}

export interface QuantifierContextHelper {
  labels: QuantifierLabelsHelper;
  taint: QuantifierLabelsHelper;
  tokens: QuantifierTokensHelper;
}

export interface QuantifierHelper {
  mx: QuantifierContextHelper;
  text: QuantifierTextHelper;
}

export interface ArrayAggregateSnapshot {
  readonly contexts: VariableContextSnapshot[];
  readonly texts: readonly string[];
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly tokens: readonly number[];
  totalTokens(): number;
  maxTokens(): number;
}

export interface GuardInputHelper {
  raw: readonly Variable[];
  mx: {
    labels: readonly DataLabel[];
    taint: readonly DataLabel[];
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
  const quantifiers = createQuantifierHelpers(aggregate.contexts, aggregate.texts);
  return {
    raw: inputs,
    mx: {
      labels: aggregate.labels,
      taint: aggregate.taint,
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
  const quantifiers = createQuantifierHelpers(aggregate.contexts, aggregate.texts);

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

  // Update .mx snapshot to include aggregate info for consumers and tests
  const mx = ensureContext(variable);
  const hasAggregateContexts = aggregate.contexts.length > 0;

  if (hasAggregateContexts) {
    mx.labels = aggregate.labels;
    mx.taint = aggregate.taint;
    mx.sources = aggregate.sources;
    mx.tokens = aggregate.tokens;
  } else if (!mx.tokens) {
    mx.tokens = aggregate.tokens;
    mx.taint = aggregate.taint;
  }

  mx.totalTokens = aggregate.totalTokens;
  mx.maxTokens = aggregate.maxTokens;
  if (Array.isArray(variable.value)) {
    mx.size = variable.value.length;
  }
  if (variable.internal?.mxCache) {
    variable.internal.mxCache = mx;
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
  const texts = Object.freeze(variables.map(variable => formatQuantifierText(variable.value)));
  const tokenValues = contexts.map(mx => mx.tokens ?? mx.tokest ?? 0);
  const tokens = Object.freeze(tokenValues.slice()) as readonly number[];
  const labels = freezeArray(
    contexts.flatMap(mx => mx.labels ?? [])
  );
  const taint = freezeArray(
    contexts.flatMap(mx => mx.taint ?? mx.labels ?? [])
  );
  const sources = freezeArray(
    contexts.flatMap(mx => mx.sources ?? [])
  );

  const totalTokens = (): number =>
    tokenValues.reduce((sum, value) => sum + (value || 0), 0);
  const maxTokens = (): number =>
    tokenValues.reduce((max, value) => Math.max(max, value || 0), 0);

  return {
    contexts,
    texts,
    labels,
    taint,
    sources,
    tokens,
    totalTokens,
    maxTokens
  };
}

function createQuantifierHelpers(
  contexts: VariableContextSnapshot[],
  texts: readonly string[]
): {
  any: QuantifierHelper;
  all: QuantifierHelper;
  none: QuantifierHelper;
} {
  return {
    any: createQuantifierHelper('any', contexts, texts),
    all: createQuantifierHelper('all', contexts, texts),
    none: createQuantifierHelper('none', contexts, texts)
  };
}

function createQuantifierHelper(
  type: QuantifierType,
  contexts: VariableContextSnapshot[],
  texts: readonly string[]
): QuantifierHelper {
  const evaluateContext = (predicate: (mx: VariableContextSnapshot) => boolean): boolean => {
    switch (type) {
      case 'any':
        return contexts.some(predicate);
      case 'all':
        return contexts.every(predicate);
      case 'none':
        return contexts.every(mx => !predicate(mx));
    }
  };
  const evaluateText = (predicate: (text: string) => boolean): boolean => {
    switch (type) {
      case 'any':
        return texts.some(predicate);
      case 'all':
        return texts.every(predicate);
      case 'none':
        return texts.every(text => !predicate(text));
    }
  };

  const labelsHelper: QuantifierLabelsHelper = {
    includes(label: DataLabel): boolean {
      return evaluateContext(mx => (mx.labels ?? []).includes(label));
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
      return evaluateContext(mx => predicate(mx.tokens ?? mx.tokest ?? 0));
    },
    greaterThan(value: number): boolean {
      return evaluateContext(mx => (mx.tokens ?? mx.tokest ?? 0) > value);
    }
  };

  const taintHelper: QuantifierLabelsHelper = {
    includes(label: DataLabel): boolean {
      return evaluateContext(mx => (mx.taint ?? mx.labels ?? []).includes(label));
    }
  };

  attachQuantifierEvaluator(taintHelper, (method, args) => {
    if (method === 'includes') {
      const label = args[0] as DataLabel;
      return taintHelper.includes(label);
    }
    return false;
  });

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

  const textHelper: QuantifierTextHelper = {
    includes(fragment: string): boolean {
      const needle = String(fragment ?? '');
      return evaluateText(text => text.includes(needle));
    }
  };

  attachQuantifierEvaluator(textHelper, (method, args) => {
    if (method === 'includes') {
      return textHelper.includes(String(args[0] ?? ''));
    }
    return false;
  });

  return {
    mx: {
      labels: labelsHelper,
      taint: taintHelper,
      tokens: tokensHelper
    },
    text: textHelper
  };
}

function formatQuantifierText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    const candidate = value as { text?: unknown; data?: unknown };
    if (typeof candidate.text === 'string' && 'data' in candidate) {
      return candidate.text;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function ensureContext(variable: Variable): VariableContextSnapshot {
  if (!('mx' in variable) || !variable.mx) {
    VariableMetadataUtils.attachContext(variable);
  }
  return variable.mx as VariableContextSnapshot;
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
