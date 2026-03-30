import { normalizeNamedOperationRef } from '@core/policy/operation-labels';
import { hasMatchingFactLabel, parseFactLabel } from '@core/policy/fact-labels';
import { expandOperationLabels } from '@core/policy/label-flow';
import {
  resolveFactRequirementsForOperation,
  resolveFactRequirementsForOperationArg,
  type FactRequirement
} from '@core/policy/fact-requirements';
import type { Environment } from '@interpreter/env/Environment';
import type { ValueHandleEntry } from '@interpreter/env/ValueHandleRegistry';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { maskFactFieldValue } from '@interpreter/eval/records/display-masking';
import { collectProofClaimLabels } from '@interpreter/security/proof-claims';
import {
  asText,
  extractSecurityDescriptor,
  isStructuredValue,
  wrapStructured,
  type StructuredValue
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

const MAX_FYI_KNOWN_CANDIDATES = 25;

type FyiKnownQuery = {
  op?: string;
  arg?: string;
};

type FactCandidate = {
  handle: string;
  label: string;
  field: string;
  fact: string;
};

type KnownAttestationCandidate = {
  handle: string;
  label: string;
  proof: 'known';
};

type KnownCandidate = FactCandidate | KnownAttestationCandidate;
type GroupedKnownCandidates = Record<string, KnownCandidate[]>;

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

function readQueryString(value: unknown): string | undefined {
  if (isVariable(value)) {
    return readQueryString(value.value);
  }
  if (isStructuredValue(value)) {
    return readQueryString(value.data);
  }
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
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

function normalizeFyiKnownQuery(raw: unknown, argOverride?: unknown): FyiKnownQuery {
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

  const op = normalizeNamedOperationRef(readQueryString(unwrapped.op));
  const arg = normalizeQueryArgName(argOverride ?? unwrapped.arg);
  return {
    ...(op ? { op } : {}),
    ...(arg ? { arg } : {})
  };
}

function resolveQueryOperationContext(
  query: FyiKnownQuery,
  env: Environment
): QueryOperationContext | undefined {
  if (!query.op) {
    return undefined;
  }

  const operationName = query.op.startsWith('op:named:')
    ? query.op.slice('op:named:'.length)
    : query.op;
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

function normalizeMetadataString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractEntryFactCandidate(entry: ValueHandleEntry): FactCandidate | undefined {
  const descriptor = extractSecurityDescriptor(entry.value, {
    recursive: true,
    mergeArrayElements: true
  });
  const fact = collectProofClaimLabels(descriptor).find(label => label.startsWith('fact:'));
  if (!fact) {
    return undefined;
  }

  const parsed = parseFactLabel(fact);
  const metadataField = normalizeMetadataString(entry.metadata?.field);
  const field = metadataField ?? parsed?.field;
  if (!field) {
    return undefined;
  }

  const preview = normalizeMetadataString(entry.preview);
  const label =
    preview
    ?? maskFactFieldValue(field, asText(entry.value).trim());

  return {
    handle: entry.handle,
    label,
    field,
    fact
  };
}

function extractKnownAttestationCandidate(
  entry: ValueHandleEntry,
  query?: FyiKnownQuery
): KnownAttestationCandidate | undefined {
  if (entry.metadata?.proof !== 'known') {
    return undefined;
  }

  const entryOp = normalizeNamedOperationRef(normalizeMetadataString(entry.metadata?.op));
  const entryArg = normalizeQueryArgName(entry.metadata?.arg);
  if (query?.op && entryOp !== query.op) {
    return undefined;
  }
  if (query?.arg && entryArg !== query.arg) {
    return undefined;
  }

  const preview = normalizeMetadataString(entry.preview);
  const label =
    preview
    ?? (() => {
      const text = asText(entry.value).trim();
      return text.length > 0 ? text : entry.handle;
    })();

  return {
    handle: entry.handle,
    label,
    proof: 'known'
  };
}

function collectAllKnownCandidates(
  entries: readonly ValueHandleEntry[]
): KnownCandidate[] {
  const candidates: KnownCandidate[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const candidate =
      extractEntryFactCandidate(entry)
      ?? extractKnownAttestationCandidate(entry);
    if (!candidate || seen.has(candidate.handle)) {
      continue;
    }
    seen.add(candidate.handle);
    candidates.push(candidate);
    if (candidates.length >= MAX_FYI_KNOWN_CANDIDATES) {
      break;
    }
  }

  return candidates;
}

function collectArgKnownCandidates(
  entries: readonly ValueHandleEntry[],
  query: FyiKnownQuery,
  requirements: readonly FactRequirement[]
): KnownCandidate[] {
  const candidates: KnownCandidate[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const factCandidate = extractEntryFactCandidate(entry);
    if (factCandidate && requirementMatchesFact(requirements, factCandidate.fact)) {
      if (!seen.has(factCandidate.handle)) {
        seen.add(factCandidate.handle);
        candidates.push(factCandidate);
      }
    } else {
      const knownCandidate = extractKnownAttestationCandidate(entry, query);
      if (knownCandidate && !seen.has(knownCandidate.handle)) {
        seen.add(knownCandidate.handle);
        candidates.push(knownCandidate);
      }
    }

    if (candidates.length >= MAX_FYI_KNOWN_CANDIDATES) {
      break;
    }
  }

  return candidates;
}

function collectGroupedKnownCandidates(
  entries: readonly ValueHandleEntry[],
  query: FyiKnownQuery,
  requirementsByArg: Readonly<Record<string, readonly FactRequirement[]>>
): GroupedKnownCandidates {
  const grouped: GroupedKnownCandidates = {};

  for (const [argName, requirements] of Object.entries(requirementsByArg)) {
    grouped[argName] = collectArgKnownCandidates(entries, {
      ...query,
      arg: argName
    }, requirements);
  }

  return grouped;
}

export async function evaluateFyiKnown(
  query: unknown,
  env: Environment,
  argOverride?: unknown
): Promise<StructuredValue<KnownCandidate[] | GroupedKnownCandidates>> {
  const normalizedQuery = normalizeFyiKnownQuery(query, argOverride);
  const entries = env.getIssuedHandles();

  if (entries.length === 0) {
    return normalizedQuery.op && !normalizedQuery.arg
      ? wrapStructured({}, 'object')
      : wrapStructured([], 'array');
  }

  if (!normalizedQuery.op && !normalizedQuery.arg) {
    return wrapStructured(collectAllKnownCandidates(entries), 'array');
  }

  if (!normalizedQuery.op && normalizedQuery.arg) {
    return wrapStructured([], 'array');
  }

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
    : resolveFactRequirementsForOperation({
        opRef: normalizedQuery.op,
        operationLabels: operationContext?.labels,
        controlArgs: operationContext?.controlArgs,
        hasControlArgsMetadata: operationContext?.hasControlArgsMetadata,
        policy: env.getPolicySummary()
      });

  if (
    normalizedQuery.arg &&
    (requirementResolution.status !== 'resolved' || requirementResolution.requirements.length === 0)
  ) {
    return wrapStructured([], 'array');
  }

  if (
    !normalizedQuery.arg &&
    (requirementResolution.status !== 'resolved'
      || Object.keys(requirementResolution.requirementsByArg).length === 0)
  ) {
    return wrapStructured({}, 'object');
  }

  if (normalizedQuery.arg) {
    return wrapStructured(
      collectArgKnownCandidates(
        entries,
        normalizedQuery,
        requirementResolution.requirements
      ),
      'array'
    );
  }

  return wrapStructured(
    collectGroupedKnownCandidates(
      entries,
      normalizedQuery,
      requirementResolution.requirementsByArg
    ),
    'object'
  );
}
