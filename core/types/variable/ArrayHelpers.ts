import type { DataLabel } from '../security';
import { normalizeSecurityDescriptor } from '../security';
import type {
  ArrayVariable,
  Variable,
  VariableContextSnapshot,
  VariableTypeDiscriminator
} from './VariableTypes';
import { VariableMetadataUtils } from './VariableMetadata';
import { getExpressionProvenance } from '../provenance/ExpressionProvenance';

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
  attestations: QuantifierLabelsHelper;
  tokens: QuantifierTokensHelper;
}

export interface QuantifierHelper {
  mx: QuantifierContextHelper;
  text: QuantifierTextHelper;
}

export interface ArrayAggregateSnapshot {
  readonly contexts: VariableContextSnapshot[];
  readonly texts: readonly string[];
  readonly textValues: QuantifierTextValues;
  readonly labels: readonly DataLabel[];
  readonly taint: readonly DataLabel[];
  readonly attestations: readonly DataLabel[];
  readonly sources: readonly string[];
  readonly tokens: readonly number[];
  totalTokens(): number;
  maxTokens(): number;
}

export interface QuantifierTextValues {
  some(predicate: (text: string) => boolean): boolean;
  every(predicate: (text: string) => boolean): boolean;
  toArray(): readonly string[];
}

export interface GuardInputHelper {
  raw: readonly Variable[];
  mx: {
    labels: readonly DataLabel[];
    taint: readonly DataLabel[];
    attestations: readonly DataLabel[];
    tokens: readonly number[];
    sources: readonly string[];
    totalTokens(): number;
    maxTokens(): number;
  };
  any: QuantifierHelper;
  all: QuantifierHelper;
  none: QuantifierHelper;
}

export interface ArrayAggregateOptions {
  nameHint?: string;
}

interface ArrayAggregateEntry {
  readonly context: VariableContextSnapshot;
  readonly textValue: unknown;
}

export function createGuardInputHelper(inputs: readonly Variable[]): GuardInputHelper {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_input__' });
  const quantifiers = createQuantifierHelpers(aggregate.contexts, aggregate.textValues);
  return {
    raw: inputs,
    mx: {
      labels: aggregate.labels,
      taint: aggregate.taint,
      attestations: aggregate.attestations,
      tokens: aggregate.tokens,
      sources: aggregate.sources,
      totalTokens: aggregate.totalTokens,
      maxTokens: aggregate.maxTokens
    },
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
  const quantifiers = createQuantifierHelpers(aggregate.contexts, aggregate.textValues);

  const helperTargets: unknown[] = [variable];
  if (Array.isArray(arrayValues) && Object.isExtensible(arrayValues)) {
    helperTargets.push(arrayValues);
  }

  for (const target of helperTargets) {
    defineHelperProperty(target, 'raw', arrayValues);
    defineHelperProperty(target, 'any', quantifiers.any);
    defineHelperProperty(target, 'all', quantifiers.all);
    defineHelperProperty(target, 'none', quantifiers.none);
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
    mx.attestations = aggregate.attestations;
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
  const entries = values
    .map(value => createArrayAggregateEntry(value, nameHint))
    .filter((value): value is ArrayAggregateEntry => Boolean(value));
  const contexts = entries.map(entry => entry.context);
  const textValues = createLazyQuantifierTexts(entries.map(entry => entry.textValue));
  const tokenValues = contexts.map(mx => mx.tokens ?? mx.tokest ?? 0);
  const tokens = Object.freeze(tokenValues.slice()) as readonly number[];
  const labels = freezeArray(
    contexts.flatMap(mx => mx.labels ?? [])
  );
  const taint = freezeArray(
    contexts.flatMap(mx => mx.taint ?? mx.labels ?? [])
  );
  const attestations = freezeArray(
    contexts.flatMap(mx => mx.attestations ?? [])
  );
  const sources = freezeArray(
    contexts.flatMap(mx => mx.sources ?? [])
  );

  const totalTokens = (): number =>
    tokenValues.reduce((sum, value) => sum + (value || 0), 0);
  const maxTokens = (): number =>
    tokenValues.reduce((max, value) => Math.max(max, value || 0), 0);

  const aggregate = {
    contexts,
    get texts(): readonly string[] {
      return textValues.toArray();
    },
    textValues,
    labels,
    taint,
    attestations,
    sources,
    tokens,
    totalTokens,
    maxTokens
  };

  return aggregate;
}

function createQuantifierHelpers(
  contexts: VariableContextSnapshot[],
  texts: QuantifierTextValues
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

  const attestationHelper: QuantifierLabelsHelper = {
    includes(label: DataLabel): boolean {
      return evaluateContext(mx => (mx.attestations ?? []).includes(label));
    }
  };

  attachQuantifierEvaluator(taintHelper, (method, args) => {
    if (method === 'includes') {
      const label = args[0] as DataLabel;
      return taintHelper.includes(label);
    }
    return false;
  });

  attachQuantifierEvaluator(attestationHelper, (method, args) => {
    if (method === 'includes') {
      const label = args[0] as DataLabel;
      return attestationHelper.includes(label);
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
      attestations: attestationHelper,
      tokens: tokensHelper
    },
    text: textHelper
  };
}

function createArrayAggregateEntry(value: unknown, nameHint: string): ArrayAggregateEntry | undefined {
  if (isVariableLike(value)) {
    const variable = value as Variable;
    return {
      context: ensureContext(variable),
      textValue: variable.value
    };
  }

  const descriptor = normalizeSecurityDescriptor(getExpressionProvenance(value));
  if (!descriptor) {
    return undefined;
  }

  return {
    context: {
      name: nameHint,
      type: inferContextType(value),
      labels: descriptor.labels,
      taint: descriptor.taint.length > 0 ? descriptor.taint : descriptor.labels,
      attestations: descriptor.attestations,
      sources: descriptor.sources,
      urls: descriptor.urls,
      tools: descriptor.tools,
      policy: descriptor.policyContext ?? null
    },
    textValue: value
  };
}

function inferContextType(value: unknown): VariableTypeDiscriminator {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value && typeof value === 'object') {
    return 'object';
  }
  if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || value === null
  ) {
    return 'primitive';
  }
  return 'simple-text';
}

function createLazyQuantifierTexts(values: readonly unknown[]): QuantifierTextValues {
  const cache = new Array<string>(values.length);
  const computed = new Uint8Array(values.length);
  let snapshot: readonly string[] | undefined;

  const at = (index: number): string => {
    if (!computed[index]) {
      cache[index] = formatQuantifierText(values[index]);
      computed[index] = 1;
    }
    return cache[index];
  };

  return {
    some(predicate: (text: string) => boolean): boolean {
      for (let index = 0; index < values.length; index += 1) {
        if (predicate(at(index))) {
          return true;
        }
      }
      return false;
    },
    every(predicate: (text: string) => boolean): boolean {
      for (let index = 0; index < values.length; index += 1) {
        if (!predicate(at(index))) {
          return false;
        }
      }
      return true;
    },
    toArray(): readonly string[] {
      if (snapshot) {
        return snapshot;
      }
      for (let index = 0; index < values.length; index += 1) {
        at(index);
      }
      snapshot = Object.freeze(cache.slice());
      return snapshot;
    }
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
    const candidate = value as { text?: unknown; data?: unknown; type?: unknown };
    if ('data' in candidate) {
      const textDescriptor = Object.getOwnPropertyDescriptor(candidate, 'text');
      if (textDescriptor && 'value' in textDescriptor && typeof textDescriptor.value === 'string') {
        return textDescriptor.value;
      }

      const structuredData = candidate.data;
      if (
        typeof structuredData === 'string'
        || typeof structuredData === 'number'
        || typeof structuredData === 'boolean'
        || typeof structuredData === 'bigint'
      ) {
        return String(structuredData);
      }
      if (structuredData === null || structuredData === undefined) {
        return '';
      }
      if (Array.isArray(structuredData)) {
        const type = typeof candidate.type === 'string' ? candidate.type : 'array';
        return `[${type}:${structuredData.length}]`;
      }
      if (typeof structuredData === 'object') {
        const type = typeof candidate.type === 'string' ? candidate.type : 'object';
        return `[${type}]`;
      }
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
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    return;
  }
  if (
    !Object.isExtensible(target) &&
    !Object.prototype.hasOwnProperty.call(target, key)
  ) {
    return;
  }
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
