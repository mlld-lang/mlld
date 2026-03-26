import { normalizeNamedOperationRef } from '@core/policy/operation-labels';
import { hasMatchingFactLabel, parseFactLabel } from '@core/policy/fact-labels';
import { expandOperationLabels } from '@core/policy/label-flow';
import { deriveBuiltInFactPatternsForOperationArg } from '@core/policy/fact-requirements';
import type { Environment } from '@interpreter/env/Environment';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { accessField } from '@interpreter/utils/field-access';
import { asText, isStructuredValue, wrapStructured, type StructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

const MAX_FYI_FACT_CANDIDATES = 25;

type FyiFactsQuery = {
  op?: string;
  arg?: string;
};

type FactCandidate = {
  handle: string;
  label: string;
  field: string;
  fact: string;
};

type QueryOperationContext = {
  labels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeFyiFactsQuery(raw: unknown): FyiFactsQuery {
  if (!raw) {
    return {};
  }

  const source = isStructuredValue(raw)
    ? raw.data
    : raw;

  if (!isPlainObject(source)) {
    return {};
  }

  const op = typeof source.op === 'string' ? normalizeNamedOperationRef(source.op) : undefined;
  const arg = typeof source.arg === 'string' ? source.arg.trim().toLowerCase() : undefined;
  return {
    ...(op ? { op } : {}),
    ...(arg ? { arg } : {})
  };
}

function resolveQueryOperationContext(
  query: FyiFactsQuery,
  env: Environment
): QueryOperationContext | undefined {
  if (!query.op) {
    return undefined;
  }

  const operationName = query.op.startsWith('op:@') ? query.op.slice(4) : query.op;
  const metadata = resolveNamedOperationMetadata(env, operationName);
  if (!metadata) {
    return undefined;
  }

  return {
    labels: expandOperationLabels(
      metadata.labels,
      env.getPolicySummary()?.operations
    ),
    controlArgs: metadata.controlArgs,
    hasControlArgsMetadata: metadata.hasControlArgsMetadata
  };
}

function extractCandidateFromLeaf(value: StructuredValue): {
  label: string;
  field: string;
  fact: string;
  ref: string;
} | null {
  const labels = Array.isArray(value.mx?.labels) ? value.mx.labels : [];
  const facts = labels.filter((label): label is string => typeof label === 'string' && label.startsWith('fact:'));
  if (facts.length === 0) {
    return null;
  }

  const fact = facts[0]!;
  const parsed = parseFactLabel(fact);
  const factSource = value.mx.factsources?.[0];
  const field = factSource?.field ?? parsed?.field;
  const ref = factSource?.ref ?? parsed?.ref;
  if (!field || !ref) {
    return null;
  }

  return {
    label: asText(value),
    field,
    fact,
    ref
  };
}

async function collectFactCandidates(
  value: unknown,
  env: Environment,
  output: Array<{ value: StructuredValue; label: string; field: string; fact: string; ref: string }>
): Promise<void> {
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    const candidate = extractCandidateFromLeaf(resolved);
    if (candidate) {
      output.push({ value: resolved, ...candidate });
    }

    if (resolved.type === 'object' && resolved.data && typeof resolved.data === 'object' && !Array.isArray(resolved.data)) {
      for (const key of Object.keys(resolved.data as Record<string, unknown>)) {
        const child = await accessField(resolved, { type: 'field', value: key } as any, { env });
        await collectFactCandidates(child, env, output);
      }
      return;
    }

    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      for (let index = 0; index < resolved.data.length; index += 1) {
        const child = await accessField(resolved, { type: 'index', value: index } as any, { env });
        await collectFactCandidates(child, env, output);
      }
    }
    return;
  }

  if (Array.isArray(resolved)) {
    for (const item of resolved) {
      await collectFactCandidates(item, env, output);
    }
    return;
  }

  if (isPlainObject(resolved)) {
    for (const item of Object.values(resolved)) {
      await collectFactCandidates(item, env, output);
    }
  }
}

export async function evaluateFyiFacts(query: unknown, env: Environment): Promise<StructuredValue<FactCandidate[]>> {
  const normalizedQuery = normalizeFyiFactsQuery(query);
  const operationContext = resolveQueryOperationContext(normalizedQuery, env);
  const requiredPatterns = deriveBuiltInFactPatternsForOperationArg({
    arg: normalizedQuery.arg,
    operationLabels: operationContext?.labels,
    controlArgs: operationContext?.controlArgs,
    hasControlArgsMetadata: operationContext?.hasControlArgsMetadata
  });
  const scopedConfig = env.getScopedEnvironmentConfig() as { fyi?: { facts?: unknown[] } } | undefined;
  const configuredRoots = Array.isArray(scopedConfig?.fyi?.facts) ? scopedConfig!.fyi!.facts : [];

  if (configuredRoots.length === 0) {
    return wrapStructured([], 'array');
  }

  if (Array.isArray(requiredPatterns) && requiredPatterns.length === 0) {
    return wrapStructured([], 'array');
  }

  const collected: Array<{ value: StructuredValue; label: string; field: string; fact: string; ref: string }> = [];
  for (const root of configuredRoots) {
    await collectFactCandidates(root, env, collected);
  }

  const deduped = new Map<string, { value: StructuredValue; label: string; field: string; fact: string; ref: string }>();
  for (const entry of collected) {
    if (
      requiredPatterns &&
      !requiredPatterns.some(pattern => hasMatchingFactLabel([entry.fact], pattern))
    ) {
      continue;
    }
    const key = `${entry.ref}\u0000${entry.fact}\u0000${entry.label}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  const candidates: FactCandidate[] = [];
  for (const entry of deduped.values()) {
    if (candidates.length >= MAX_FYI_FACT_CANDIDATES) {
      break;
    }
    const issued = env.issueHandle(entry.value, {
      preview: entry.label,
      metadata: {
        field: entry.field,
        ref: entry.ref,
        fact: entry.fact,
        ...(normalizedQuery.op ? { op: normalizedQuery.op } : {}),
        ...(normalizedQuery.arg ? { arg: normalizedQuery.arg } : {})
      }
    });
    candidates.push({
      handle: issued.handle,
      label: entry.label,
      field: entry.field,
      fact: entry.fact
    });
  }

  return wrapStructured(candidates, 'array');
}
