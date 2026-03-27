import { normalizeNamedOperationRef } from '@core/policy/operation-labels';
import { hasMatchingFactLabel, parseFactLabel } from '@core/policy/fact-labels';
import { expandOperationLabels } from '@core/policy/label-flow';
import {
  resolveFactRequirementsForOperation,
  resolveFactRequirementsForOperationArg,
  type FactRequirement
} from '@core/policy/fact-requirements';
import type { Environment } from '@interpreter/env/Environment';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { maskFactFieldValue } from '@interpreter/eval/records/display-masking';
import { accessField } from '@interpreter/utils/field-access';
import { asText, isStructuredValue, wrapStructured, type StructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

const MAX_FYI_FACT_CANDIDATES = 25;
const FACT_DISPLAY_FIELD_PREFERENCES = ['name', 'title', 'display', 'display_name', 'label'] as const;

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

type GroupedFactCandidates = Record<string, FactCandidate[]>;

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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function unwrapQueryEnvelope(raw: unknown): unknown {
  if (isStructuredValue(raw)) {
    return unwrapQueryEnvelope(raw.data);
  }
  if (!isObjectLike(raw)) {
    return raw;
  }
  if (
    Object.prototype.hasOwnProperty.call(raw, 'query') &&
    !Object.prototype.hasOwnProperty.call(raw, 'op') &&
    !Object.prototype.hasOwnProperty.call(raw, 'arg')
  ) {
    return (raw as Record<string, unknown>).query;
  }
  return raw;
}

function normalizeFyiFactsQuery(raw: unknown, argOverride?: unknown): FyiFactsQuery {
  const unwrapped = unwrapQueryEnvelope(raw);
  if (!unwrapped && argOverride === undefined) {
    return {};
  }

  if (!isObjectLike(unwrapped)) {
    const op = normalizeNamedOperationRef(readQueryString(unwrapped));
    const arg = normalizeQueryArgName(argOverride);
    return {
      ...(op ? { op } : {}),
      ...(arg ? { arg } : {})
    };
  }

  const source = unwrapped;
  const op = normalizeNamedOperationRef(readQueryString(source.op));
  const arg = normalizeQueryArgName(argOverride ?? source.arg);
  return {
    ...(op ? { op } : {}),
    ...(arg ? { arg } : {})
  };
}

function readQueryString(value: unknown): string | undefined {
  if (isVariable(value)) {
    return readQueryString(value.value);
  }
  if (isStructuredValue(value)) {
    return readQueryString(value.data);
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function normalizeQueryArgName(value: unknown): string | undefined {
  const queryString = readQueryString(value);
  if (!queryString) {
    return undefined;
  }
  const normalized = queryString.toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveQueryOperationContext(
  query: FyiFactsQuery,
  env: Environment
): QueryOperationContext | undefined {
  if (!query.op) {
    return undefined;
  }

  const operationName = query.op.startsWith('op:named:') ? query.op.slice('op:named:'.length) : query.op;
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

function requirementMatchesFact(requirements: readonly FactRequirement[], fact: string): boolean {
  return requirements.every(requirement =>
    requirement.patterns.some(pattern => hasMatchingFactLabel([fact], pattern))
  );
}

function issueFactCandidate(options: {
  env: Environment;
  entry: { value: StructuredValue; label: string; field: string; fact: string; ref: string };
  op?: string;
  arg?: string;
}): FactCandidate {
  const issued = options.env.issueHandle(options.entry.value, {
    preview: options.entry.label,
    metadata: {
      field: options.entry.field,
      ref: options.entry.ref,
      fact: options.entry.fact,
      ...(options.op ? { op: options.op } : {}),
      ...(options.arg ? { arg: options.arg } : {})
    }
  });

  return {
    handle: issued.handle,
    label: options.entry.label,
    field: options.entry.field,
    fact: options.entry.fact
  };
}

function readDisplayText(value: unknown): string | null {
  const resolved = isVariable(value) ? value.value : value;
  if (isStructuredValue(resolved)) {
    const text = asText(resolved).trim();
    return text.length > 0 ? text : null;
  }
  if (
    typeof resolved === 'string' ||
    typeof resolved === 'number' ||
    typeof resolved === 'boolean'
  ) {
    const text = String(resolved).trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function deriveSafeCandidateLabel(options: {
  value: StructuredValue;
  field: string;
  parent?: StructuredValue;
}): string {
  const parent = options.parent;
  if (parent?.type === 'object' && parent.data && typeof parent.data === 'object' && !Array.isArray(parent.data)) {
    const objectData = parent.data as Record<string, unknown>;
    for (const preferredField of FACT_DISPLAY_FIELD_PREFERENCES) {
      if (preferredField === options.field) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(objectData, preferredField)) {
        continue;
      }
      const displayText = readDisplayText(objectData[preferredField]);
      if (displayText) {
        return displayText;
      }
    }
  }

  const rawText = asText(options.value).trim();
  return maskFactFieldValue(options.field, rawText);
}

function extractCandidateFromLeaf(options: {
  value: StructuredValue;
  parent?: StructuredValue;
}): {
  label: string;
  field: string;
  fact: string;
  ref: string;
} | null {
  const value = options.value;
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
    label: deriveSafeCandidateLabel({
      value,
      field,
      parent: options.parent
    }),
    field,
    fact,
    ref
  };
}

async function collectFactCandidates(
  value: unknown,
  env: Environment,
  output: Array<{ value: StructuredValue; label: string; field: string; fact: string; ref: string }>,
  context: { parent?: StructuredValue } = {}
): Promise<void> {
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    if (resolved.type === 'object' && resolved.data && typeof resolved.data === 'object' && !Array.isArray(resolved.data)) {
      for (const key of Object.keys(resolved.data as Record<string, unknown>)) {
        const child = await accessField(resolved, { type: 'field', value: key } as any, { env });
        await collectFactCandidates(child, env, output, { parent: resolved });
      }
      return;
    }

    if (resolved.type === 'array' && Array.isArray(resolved.data)) {
      for (let index = 0; index < resolved.data.length; index += 1) {
        const child = await accessField(resolved, { type: 'arrayIndex', value: index } as any, { env });
        await collectFactCandidates(child, env, output, { parent: resolved });
      }
      return;
    }

    const candidate = extractCandidateFromLeaf({
      value: resolved,
      parent: context.parent
    });
    if (candidate) {
      output.push({ value: resolved, ...candidate });
    }
    return;
  }

  if (Array.isArray(resolved)) {
    for (const item of resolved) {
      await collectFactCandidates(item, env, output, context);
    }
    return;
  }

  if (isPlainObject(resolved)) {
    for (const item of Object.values(resolved)) {
      await collectFactCandidates(item, env, output, context);
    }
  }
}

export async function evaluateFyiFacts(
  query: unknown,
  env: Environment,
  argOverride?: unknown
): Promise<StructuredValue<FactCandidate[] | GroupedFactCandidates>> {
  const normalizedQuery = normalizeFyiFactsQuery(query, argOverride);
  const isBroadDiscovery = !normalizedQuery.op && !normalizedQuery.arg;
  const operationContext = resolveQueryOperationContext(normalizedQuery, env);
  const requirementResolution = normalizedQuery.arg
    ? resolveFactRequirementsForOperationArg({
        opRef: normalizedQuery.op,
        argName: normalizedQuery.arg,
        operationLabels: operationContext?.labels,
        controlArgs: operationContext?.controlArgs,
        hasControlArgsMetadata: operationContext?.hasControlArgsMetadata,
        policy: env.getPolicySummary()
      })
    : normalizedQuery.op
      ? resolveFactRequirementsForOperation({
          opRef: normalizedQuery.op,
          operationLabels: operationContext?.labels,
          controlArgs: operationContext?.controlArgs,
          hasControlArgsMetadata: operationContext?.hasControlArgsMetadata,
          policy: env.getPolicySummary()
        })
      : null;
  const scopedConfig = env.getScopedEnvironmentConfig() as
    | { fyi?: { facts?: unknown[]; autoFacts?: boolean } }
    | undefined;
  const configuredRoots = Array.isArray(scopedConfig?.fyi?.facts) ? scopedConfig!.fyi!.facts : [];
  const autoRoots = scopedConfig?.fyi?.autoFacts ? env.getFyiAutoFactRoots() : [];
  const discoveryRoots = [...configuredRoots, ...autoRoots];

  if (discoveryRoots.length === 0) {
    return normalizedQuery.op && !normalizedQuery.arg
      ? wrapStructured({}, 'object')
      : wrapStructured([], 'array');
  }

  if (
    requirementResolution &&
    (
      (normalizedQuery.arg &&
        (requirementResolution.status !== 'resolved' || requirementResolution.requirements.length === 0)) ||
      (!normalizedQuery.arg &&
        (requirementResolution.status !== 'resolved' ||
          Object.keys(requirementResolution.requirementsByArg).length === 0))
    )
  ) {
    return normalizedQuery.op && !normalizedQuery.arg
      ? wrapStructured({}, 'object')
      : wrapStructured([], 'array');
  }

  const collected: Array<{ value: StructuredValue; label: string; field: string; fact: string; ref: string }> = [];
  for (const root of discoveryRoots) {
    await collectFactCandidates(root, env, collected);
  }

  if (isBroadDiscovery || normalizedQuery.arg) {
    const deduped = new Map<string, { value: StructuredValue; label: string; field: string; fact: string; ref: string }>();
    for (const entry of collected) {
      if (
        normalizedQuery.arg &&
        requirementResolution &&
        !requirementMatchesFact(requirementResolution.requirements, entry.fact)
      ) {
        continue;
      }
      const key = `${entry.ref}\u0000${entry.fact}\u0000${asText(entry.value)}`;
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    }

    const candidates: FactCandidate[] = [];
    for (const entry of deduped.values()) {
      if (candidates.length >= MAX_FYI_FACT_CANDIDATES) {
        break;
      }
      candidates.push(
        issueFactCandidate({
          env,
          entry,
          op: normalizedQuery.op,
          arg: normalizedQuery.arg
        })
      );
    }

    return wrapStructured(candidates, 'array');
  }

  const groupedCandidates: GroupedFactCandidates = {};
  for (const [argName, requirements] of Object.entries(requirementResolution?.requirementsByArg ?? {})) {
    const deduped = new Map<string, { value: StructuredValue; label: string; field: string; fact: string; ref: string }>();
    for (const entry of collected) {
      if (!requirementMatchesFact(requirements, entry.fact)) {
        continue;
      }
      const key = `${entry.ref}\u0000${entry.fact}\u0000${asText(entry.value)}`;
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    }

    groupedCandidates[argName] = [];
    for (const entry of deduped.values()) {
      if (groupedCandidates[argName]!.length >= MAX_FYI_FACT_CANDIDATES) {
        break;
      }
      groupedCandidates[argName]!.push(
        issueFactCandidate({
          env,
          entry,
          op: normalizedQuery.op
        })
      );
    }
  }

  return wrapStructured(groupedCandidates, 'object');
}
