import { parseFactLabel } from '@core/policy/fact-labels';
import { resolveFactRequirementsForOperation } from '@core/policy/fact-requirements';
import { expandOperationLabels } from '@core/policy/label-flow';
import { MlldSecurityError } from '@core/errors';
import type { PolicyConfig } from '@core/policy/union';
import type { Environment } from '@interpreter/env/Environment';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { collectProofClaimLabels, proofStrengthForValue } from '@interpreter/security/proof-claims';
import { encodeCanonicalValue } from '@interpreter/security/canonical-value';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
import { canonicalizeProjectedValue } from '@interpreter/utils/projected-value-canonicalization';
import { materializeSessionProofMatches } from '@interpreter/utils/session-proof-matching';
import {
  extractSecurityDescriptor,
  getRecordProjectionMetadata,
  getStructuredChildValues,
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

export type RuntimeRepairEvent =
  | { kind: 'resolved_handle' }
  | { kind: 'lifted_fact_value' }
  | { kind: 'canonicalized_projected_value' }
  | { kind: 'rebound_session_proof' }
  | { kind: 'dropped_ambiguous_array_element'; index: number; value: string; error: MlldSecurityError }
  | { kind: 'ambiguous_projected_value'; error: MlldSecurityError };

export function collectSecurityRelevantArgNamesForOperation(options: {
  env: Environment;
  operationName: string;
  labels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  policy?: PolicyConfig;
}): string[] {
  const metadata =
    options.labels !== undefined || options.controlArgs !== undefined
      ? {
          labels: [...(options.labels ?? [])],
          controlArgs: options.controlArgs,
          hasControlArgsMetadata: options.hasControlArgsMetadata === true
        }
      : resolveNamedOperationMetadata(options.env, options.operationName);

  if (!metadata) {
    return [];
  }

  const resolution = resolveFactRequirementsForOperation({
    opRef: options.operationName,
    operationLabels: expandOperationLabels(
      metadata.labels,
      options.policy?.operations
    ),
    controlArgs: metadata.controlArgs,
    hasControlArgsMetadata: metadata.hasControlArgsMetadata,
    policy: options.policy
  });

  const argNames = new Set(Object.keys(resolution.requirementsByArg));
  if (metadata.hasControlArgsMetadata) {
    for (const argName of metadata.controlArgs ?? []) {
      if (typeof argName === 'string' && argName.trim().length > 0) {
        argNames.add(argName);
      }
    }
  }

  return [...argNames];
}

export async function repairSecurityRelevantValue(options: {
  value: unknown;
  env: Environment;
  matchScope?: 'session' | 'global';
  includeSessionProofMatches?: boolean;
  preserveOnAmbiguous?: boolean;
  dropAmbiguousArrayElements?: boolean;
  collapseEquivalentProjectedMatches?: boolean;
}): Promise<{ value: unknown; events: RuntimeRepairEvent[] }> {
  const collectionRepair = await repairArrayLikeValue(options);
  if (collectionRepair) {
    return collectionRepair;
  }

  const events: RuntimeRepairEvent[] = [];
  const matchScope = options.matchScope ?? 'session';
  // Same-session proof rebinding is narrower than alias canonicalization. Callers
  // must opt in so handle-only projections do not silently widen into bare literals.
  const includeSessionProofMatches = options.includeSessionProofMatches === true;

  const handleResolved = await resolveValueHandles(options.value, options.env);
  if (handleResolved !== options.value) {
    events.push({ kind: 'resolved_handle' });
  }

  let repaired = liftFactBearingValue(handleResolved, options.env);
  if (repaired !== handleResolved) {
    events.push({ kind: 'lifted_fact_value' });
  }
  try {
    const canonicalized = await canonicalizeProjectedValue(repaired, options.env, {
      matchScope,
      collapseEquivalentMatches: options.collapseEquivalentProjectedMatches === true
    });
    if (canonicalized !== repaired) {
      events.push({ kind: 'canonicalized_projected_value' });
    }
    repaired = canonicalized;
  } catch (error) {
    if (
      error instanceof MlldSecurityError
      && error.code === 'AMBIGUOUS_PROJECTED_VALUE'
      && options.preserveOnAmbiguous === true
    ) {
      events.push({ kind: 'ambiguous_projected_value', error });
      return {
        value: handleResolved,
        events
      };
    }
    throw error;
  }

  if (includeSessionProofMatches) {
    const rebound = materializeSessionProofMatches(repaired, options.env);
    if (rebound !== repaired) {
      events.push({ kind: 'rebound_session_proof' });
      repaired = rebound;
    }
  }

  return {
    value: repaired,
    events
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneWithOwnDescriptors<T extends object>(value: T): T {
  const clone = Object.create(Object.getPrototypeOf(value));
  Object.defineProperties(clone, Object.getOwnPropertyDescriptors(value));
  return clone;
}

async function repairArrayLikeValue(options: {
  value: unknown;
  env: Environment;
  matchScope?: 'session' | 'global';
  includeSessionProofMatches?: boolean;
  preserveOnAmbiguous?: boolean;
  dropAmbiguousArrayElements?: boolean;
  collapseEquivalentProjectedMatches?: boolean;
}): Promise<{ value: unknown; events: RuntimeRepairEvent[] } | undefined> {
  if (options.dropAmbiguousArrayElements !== true) {
    return undefined;
  }

  if (isVariable(options.value)) {
    const repaired = await repairArrayLikeValue({
      ...options,
      value: options.value.value
    });
    if (!repaired) {
      return undefined;
    }
    const clone = cloneWithOwnDescriptors(options.value);
    (clone as typeof options.value).value = repaired.value;
    return {
      value: clone,
      events: repaired.events
    };
  }

  if (isStructuredValue(options.value) && options.value.type === 'array' && Array.isArray(options.value.data)) {
    const repaired = await repairAmbiguousArrayElements(options.value.data, options);
    const wrapped = wrapStructured(
      repaired.value,
      options.value.type,
      options.value.text,
      options.value.metadata
    );
    if (options.value.internal) {
      wrapped.internal = { ...options.value.internal };
    }
    return {
      value: wrapped,
      events: repaired.events
    };
  }

  if (Array.isArray(options.value)) {
    return repairAmbiguousArrayElements(options.value, options);
  }

  return undefined;
}

async function repairAmbiguousArrayElements(
  value: readonly unknown[],
  options: {
    env: Environment;
    matchScope?: 'session' | 'global';
    includeSessionProofMatches?: boolean;
    preserveOnAmbiguous?: boolean;
    dropAmbiguousArrayElements?: boolean;
    collapseEquivalentProjectedMatches?: boolean;
  }
): Promise<{ value: unknown[]; events: RuntimeRepairEvent[] }> {
  const repairedItems: unknown[] = [];
  const events: RuntimeRepairEvent[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    try {
      const repaired = await repairSecurityRelevantValue({
        ...options,
        value: item,
        dropAmbiguousArrayElements: false
      });
      repairedItems.push(repaired.value);
      events.push(...repaired.events);
    } catch (error) {
      if (error instanceof MlldSecurityError && error.code === 'AMBIGUOUS_PROJECTED_VALUE') {
        events.push({
          kind: 'dropped_ambiguous_array_element',
          index,
          value: stringifyRepairValue(item),
          error
        });
        continue;
      }
      throw error;
    }
  }

  return {
    value: repairedItems,
    events
  };
}

function stringifyRepairValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (isStructuredValue(value) && typeof value.text === 'string') {
    return value.text;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function liftFactBearingValue(value: unknown, env: Environment): unknown {
  if (isVariable(value)) {
    const lifted = liftFactBearingValue(value.value, env);
    if (lifted === value.value) {
      return value;
    }
    const clone = cloneWithOwnDescriptors(value);
    (clone as typeof value).value = lifted;
    return clone;
  }

  if (isStructuredValue(value)) {
    if (value.type === 'array' && Array.isArray(value.data)) {
      const nextItems = value.data.map(item => liftFactBearingValue(item, env));
      if (nextItems.every((item, index) => item === value.data[index])) {
        return findFactSourceValueMatch(value, env) ?? value;
      }
      const wrapped = wrapStructured(
        nextItems,
        value.type,
        value.text,
        value.metadata
      );
      if (value.internal) {
        wrapped.internal = { ...value.internal };
      }
      return wrapped;
    }

    if (value.type === 'object' && isPlainObject(value.data)) {
      const nextEntries = Object.fromEntries(
        Object.entries(value.data).map(([key, entry]) => [key, liftFactBearingValue(entry, env)])
      );
      const unchanged = Object.keys(nextEntries).every(
        key => nextEntries[key] === (value.data as Record<string, unknown>)[key]
      );
      if (unchanged) {
        return findFactSourceValueMatch(value, env) ?? value;
      }
      const wrapped = wrapStructured(
        nextEntries,
        value.type,
        value.text,
        value.metadata
      );
      if (value.internal) {
        wrapped.internal = { ...value.internal };
      }
      return wrapped;
    }

    return findFactSourceValueMatch(value, env) ?? value;
  }

  if (Array.isArray(value)) {
    const nextItems = value.map(item => liftFactBearingValue(item, env));
    return nextItems.every((item, index) => item === value[index]) ? value : nextItems;
  }

  if (isPlainObject(value)) {
    const nextEntries = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, liftFactBearingValue(entry, env)])
    );
    const unchanged = Object.keys(nextEntries).every(key => nextEntries[key] === value[key]);
    return unchanged ? value : nextEntries;
  }

  return value;
}

function findFactSourceValueMatch(value: unknown, env: Environment): unknown | undefined {
  const targetKey = encodeCanonicalValue(value);
  if (!targetKey) {
    return undefined;
  }

  const targetRefs = collectFactIdentityRefs(value);
  if (targetRefs.size === 0) {
    return undefined;
  }

  let bestMatch: unknown | undefined;
  let bestScore = getFactBindingScore(value);
  const seen = new WeakSet<object>();

  const visit = (entry: unknown): void => {
    const candidateKey = encodeCanonicalValue(entry);
    if (candidateKey === targetKey) {
      const candidateRefs = collectFactIdentityRefs(entry);
      if (sharesFactIdentity(targetRefs, candidateRefs)) {
        const score = getFactBindingScore(entry);
        if (bestMatch === undefined || score > bestScore) {
          bestMatch = entry;
          bestScore = score;
        }
      }
    }

    const raw = isVariable(entry)
      ? entry.value
      : isStructuredValue(entry)
        ? entry.data
        : entry;
    if (!raw || typeof raw !== 'object') {
      return;
    }
    if (seen.has(raw as object)) {
      return;
    }
    seen.add(raw as object);

    for (const child of iterateFactBearingChildren(entry)) {
      visit(child);
    }
  };

  for (const root of env.getFyiAutoFactRoots()) {
    visit(root);
  }

  return bestMatch;
}

function getFactBindingScore(value: unknown): number {
  const resolved = isVariable(value) ? value.value : value;
  let score = proofStrengthForValue(resolved) * 100;

  if (resolved && typeof resolved === 'object') {
    const candidate = resolved as {
      mx?: { factsources?: readonly unknown[] };
      metadata?: { factsources?: readonly unknown[] };
    };
    const factSources = new Set(
      [
        ...(Array.isArray(candidate.mx?.factsources) ? candidate.mx?.factsources : []),
        ...(Array.isArray(candidate.metadata?.factsources) ? candidate.metadata?.factsources : [])
      ].map(entry => JSON.stringify(entry))
    );
    score += factSources.size * 10;
  }

  if (isStructuredValue(resolved) && getRecordProjectionMetadata(resolved)) {
    score += 1;
  }

  return score;
}

function iterateFactBearingChildren(value: unknown): unknown[] {
  const resolved = isVariable(value) ? value.value : value;

  if (isStructuredValue(resolved)) {
    return getStructuredChildValues(resolved);
  }

  if (Array.isArray(resolved)) {
    return resolved;
  }

  if (isPlainObject(resolved)) {
    return Object.values(resolved);
  }

  return [];
}

function collectFactIdentityRefs(value: unknown): Set<string> {
  const refs = new Set<string>();
  const resolved = isVariable(value) ? value.value : value;

  if (!resolved || typeof resolved !== 'object') {
    return refs;
  }

  const candidate = resolved as {
    mx?: { factsources?: readonly { ref?: string }[] };
    metadata?: { factsources?: readonly { ref?: string }[] };
  };
  const factSources = [
    ...(Array.isArray(candidate.mx?.factsources) ? candidate.mx?.factsources : []),
    ...(Array.isArray(candidate.metadata?.factsources) ? candidate.metadata?.factsources : [])
  ];
  for (const handle of factSources) {
    const ref = typeof handle?.ref === 'string' ? handle.ref.trim().toLowerCase() : '';
    if (ref) {
      refs.add(ref);
    }
  }

  const descriptor = extractSecurityDescriptor(resolved, { recursive: false, normalize: true });
  for (const label of collectProofClaimLabels(descriptor)) {
    const parsed = parseFactLabel(label);
    if (parsed?.ref) {
      refs.add(parsed.ref.toLowerCase());
    }
  }

  return refs;
}

function sharesFactIdentity(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size === 0 || right.size === 0) {
    return false;
  }
  for (const entry of left) {
    if (right.has(entry)) {
      return true;
    }
  }
  return false;
}
