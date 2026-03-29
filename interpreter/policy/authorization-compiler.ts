import {
  normalizePolicyAuthorizations,
  validateNormalizedPolicyAuthorizations,
  validatePolicyAuthorizations,
  type AuthorizationConstraintClause,
  type AuthorizationToolContext,
  type PolicyAuthorizationIssue,
  type PolicyAuthorizationValidationResult,
  type PolicyAuthorizations
} from '@core/policy/authorizations';
import { isHandleWrapper } from '@core/types/handle';
import { DECLARED_CONTROL_ARG_KNOWN_PATTERNS } from '@core/policy/fact-requirements';
import { matchesLabelPattern } from '@core/policy/fact-labels';
import type { PolicyConfig } from '@core/policy/union';
import { MlldSecurityError } from '@core/errors';
import { collectProofClaimLabels } from '@interpreter/security/proof-claims';
import {
  collectSecurityRelevantArgNamesForOperation,
  repairSecurityRelevantValue,
  type RuntimeRepairEvent
} from '@interpreter/security/runtime-repair';
import type { Environment } from '@interpreter/env/Environment';
import {
  asData,
  extractSecurityDescriptor,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';

export interface PolicyAuthorizationCompileReport {
  strippedArgs: Array<{ tool: string; arg: string }>;
  repairedArgs: Array<{ tool: string; arg: string; steps: string[] }>;
  droppedEntries: Array<{ tool: string; reason: string }>;
  droppedArrayElements: Array<{ tool: string; arg: string; index: number; reason: string; value: string }>;
  ambiguousValues: Array<{ tool: string; arg: string; value: string }>;
  compiledProofs: Array<{ tool: string; arg: string; labels: string[] }>;
}

export interface PolicyAuthorizationCompilerIssue {
  reason:
    | 'invalid_authorization'
    | 'missing_tool_context'
    | 'unknown_tool'
    | 'denied_by_policy'
    | 'requires_control_args'
    | 'unknown_arg'
    | 'proofless_control_arg'
    | 'proofless_resolved_value'
    | 'bucketed_intent_from_influenced_source'
    | 'superseded_by_resolved'
    | 'known_from_influenced_source'
    | 'ambiguous_projected_value';
  message: string;
  tool?: string;
  arg?: string;
  element?: number;
}

export interface CompilePolicyAuthorizationsOptions {
  rawAuthorizations: unknown;
  rawSource?: unknown;
  env: Environment;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  policy?: PolicyConfig;
  ambientDeniedTools?: readonly string[];
  mode: 'builder' | 'runtime';
}

export interface CompilePolicyAuthorizationsResult {
  authorizations?: PolicyAuthorizations;
  issues: PolicyAuthorizationCompilerIssue[];
  report: PolicyAuthorizationCompileReport;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAmbiguousProjectedValueError(error: unknown): boolean {
  return error instanceof MlldSecurityError && error.code === 'AMBIGUOUS_PROJECTED_VALUE';
}

function containsBareHandleToken(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^h_[a-z0-9]+$/.test(value.trim());
  }
  if (Array.isArray(value)) {
    return value.some(entry => containsBareHandleToken(entry));
  }
  if (isPlainObject(value)) {
    return Object.values(value).some(entry => containsBareHandleToken(entry));
  }
  return false;
}

export function createEmptyPolicyAuthorizationCompileReport(): PolicyAuthorizationCompileReport {
  return {
    strippedArgs: [],
    repairedArgs: [],
    droppedEntries: [],
    droppedArrayElements: [],
    ambiguousValues: [],
    compiledProofs: []
  };
}

export function clonePolicyAuthorizationCompileReport(
  report: PolicyAuthorizationCompileReport
): PolicyAuthorizationCompileReport {
  return {
    strippedArgs: report.strippedArgs.map(entry => ({ ...entry })),
    repairedArgs: report.repairedArgs.map(entry => ({ ...entry, steps: [...entry.steps] })),
    droppedEntries: report.droppedEntries.map(entry => ({ ...entry })),
    droppedArrayElements: report.droppedArrayElements.map(entry => ({ ...entry })),
    ambiguousValues: report.ambiguousValues.map(entry => ({ ...entry })),
    compiledProofs: report.compiledProofs.map(entry => ({ ...entry, labels: [...entry.labels] }))
  };
}

export function hasPolicyAuthorizationCompileActivity(
  report: PolicyAuthorizationCompileReport
): boolean {
  return (
    report.strippedArgs.length > 0
    || report.repairedArgs.length > 0
    || report.droppedEntries.length > 0
    || report.droppedArrayElements.length > 0
    || report.ambiguousValues.length > 0
    || report.compiledProofs.length > 0
  );
}

function runtimeRepairEventLabel(event: RuntimeRepairEvent): string {
  switch (event.kind) {
    case 'resolved_handle':
      return 'resolved_handle';
    case 'lifted_fact_value':
      return 'lifted_fact_value';
    case 'canonicalized_projected_value':
      return 'canonicalized_projected_value';
    case 'rebound_session_proof':
      return 'rebound_session_proof';
    case 'dropped_ambiguous_array_element':
      return 'dropped_ambiguous_array_element';
    case 'ambiguous_projected_value':
      return 'ambiguous_projected_value';
  }
}

function isArrayLikeConstraintValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return true;
  }
  if (isVariable(value)) {
    return isArrayLikeConstraintValue(value.value);
  }
  return isStructuredValue(value) && value.type === 'array' && Array.isArray(value.data);
}

function unwrapAuthorizationIntentContainer(raw: unknown): unknown {
  if (isPlainObject(raw) && isPlainObject(raw.authorizations)) {
    return raw.authorizations;
  }
  return raw;
}

function hasOwnProperty(value: unknown, key: string): boolean {
  return !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

function getAuthorizationIntentSourceChild(value: unknown, key: string): unknown {
  if (isStructuredValue(value) && value.type === 'object' && isPlainObject(value.data)) {
    return hasOwnProperty(value.data, key)
      ? (value.data as Record<string, unknown>)[key]
      : undefined;
  }
  if (isPlainObject(value)) {
    return hasOwnProperty(value, key)
      ? value[key]
      : undefined;
  }
  return getAstObjectEntryValue(value, key);
}

function descriptorHasInfluenced(value: ReturnType<typeof extractSecurityDescriptor>): boolean {
  if (!value) {
    return false;
  }
  return (
    (Array.isArray(value.labels) && value.labels.includes('influenced'))
    || (Array.isArray(value.taint) && value.taint.includes('influenced'))
  );
}

function bucketedIntentSourceHasInfluenced(source: unknown): boolean {
  if (descriptorHasInfluenced(findAuthorizationIntentSourceDescriptor(source, []))) {
    return true;
  }

  return ['resolved', 'known', 'allow', 'deny'].some(bucketKey =>
    descriptorHasInfluenced(findAuthorizationIntentSourceDescriptor(source, [bucketKey]))
  );
}

function findAuthorizationIntentSourceDescriptor(
  source: unknown,
  path: readonly string[]
): ReturnType<typeof extractSecurityDescriptor> | undefined {
  const root = source;
  const fullPath =
    getAuthorizationIntentSourceChild(source, 'authorizations') !== undefined
      ? ['authorizations', ...path]
      : [...path];
  const candidates: unknown[] = [root];
  let current = root;

  for (const segment of fullPath) {
    const next = getAuthorizationIntentSourceChild(current, segment);
    if (next === undefined) {
      break;
    }
    current = next;
    candidates.unshift(current);
  }

  for (const candidate of candidates) {
    const descriptor = extractSecurityDescriptor(candidate, {
      recursive: true,
      mergeArrayElements: true
    });
    if (descriptor) {
      return descriptor;
    }
  }

  return undefined;
}

function hasBucketedAuthorizationIntent(raw: unknown): boolean {
  const container = unwrapAuthorizationIntentContainer(raw);
  if (!isPlainObject(container)) {
    return false;
  }
  return (
    hasOwnProperty(container, 'resolved')
    || hasOwnProperty(container, 'known')
    || Array.isArray(container.allow)
  );
}

const HANDLE_TOKEN_RE = /^h_[a-z0-9]+$/;

function cloneRawAuthorizationEntry(entry: unknown): unknown {
  if (entry === true || !isPlainObject(entry)) {
    return entry;
  }

  if (isPlainObject(entry.args)) {
    return {
      ...entry,
      args: { ...entry.args }
    };
  }

  if (hasOwnProperty(entry, 'args') || hasOwnProperty(entry, 'kind')) {
    return { ...entry };
  }

  return {
    args: { ...entry }
  };
}

function getOrCreateRawAuthorizationArgs(
  allow: Record<string, unknown>,
  toolName: string
): Record<string, unknown> {
  const existing = allow[toolName];
  if (!isPlainObject(existing)) {
    allow[toolName] = { args: {} };
    return (allow[toolName] as { args: Record<string, unknown> }).args;
  }

  if (!isPlainObject(existing.args)) {
    existing.args = {};
  }

  return existing.args as Record<string, unknown>;
}

function mergeRawAuthorizationEntry(
  existing: unknown,
  incoming: unknown
): unknown {
  if (existing === undefined) {
    return cloneRawAuthorizationEntry(incoming);
  }
  if (incoming === true) {
    return existing;
  }
  if (existing === true) {
    return cloneRawAuthorizationEntry(incoming);
  }
  if (!isPlainObject(existing) || !isPlainObject(incoming)) {
    return cloneRawAuthorizationEntry(incoming);
  }

  const existingArgs = isPlainObject(existing.args) ? existing.args as Record<string, unknown> : {};
  const incomingArgs = isPlainObject(incoming.args) ? incoming.args as Record<string, unknown> : {};
  return {
    ...existing,
    ...incoming,
    args: {
      ...existingArgs,
      ...incomingArgs
    }
  };
}

function extractKnownBucketValue(
  raw: unknown
): { value?: unknown; hasValue: boolean } {
  if (!isPlainObject(raw)) {
    return { value: raw, hasValue: true };
  }

  if (hasOwnProperty(raw, 'value') || hasOwnProperty(raw, 'source')) {
    return {
      value: raw.value,
      hasValue: hasOwnProperty(raw, 'value')
    };
  }

  return { value: raw, hasValue: true };
}

function buildProoflessResolvedValueMessage(
  toolName: string,
  argName: string,
  element?: number
): string {
  if (typeof element === 'number') {
    return `Tool '${toolName}' resolved authorization for '${argName}[${element}]' must use a handle-backed value`;
  }
  return `Tool '${toolName}' resolved authorization for '${argName}' must use a handle-backed value`;
}

async function normalizeResolvedHandleCandidate(
  value: unknown,
  env: Environment
): Promise<unknown | undefined> {
  if (typeof value === 'string') {
    const handle = value.trim();
    if (!HANDLE_TOKEN_RE.test(handle)) {
      return undefined;
    }
    env.resolveHandle(handle);
    return handle;
  }

  if (!isHandleWrapper(value)) {
    return undefined;
  }

  const handle = value.handle.trim();
  if (!HANDLE_TOKEN_RE.test(handle)) {
    return undefined;
  }
  env.resolveHandle(handle);
  return handle === value.handle
    ? value
    : { handle };
}

async function normalizeResolvedControlArgValue(options: {
  toolName: string;
  argName: string;
  value: unknown;
  env: Environment;
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<unknown | undefined> {
  const materialized = await materializePolicySourceValue(options.value, options.env);

  if (materialized === null) {
    return null;
  }

  if (Array.isArray(materialized)) {
    if (materialized.length === 0) {
      return [];
    }

    const retained: unknown[] = [];
    for (let index = 0; index < materialized.length; index += 1) {
      const normalizedElement = await normalizeResolvedHandleCandidate(
        materialized[index],
        options.env
      );
      if (normalizedElement !== undefined) {
        retained.push(normalizedElement);
        continue;
      }

      pushCompilerIssue(options.issues, {
        reason: 'proofless_resolved_value',
        message: buildProoflessResolvedValueMessage(options.toolName, options.argName, index),
        tool: options.toolName,
        arg: options.argName,
        element: index
      });
    }

    return retained.length > 0
      ? retained
      : undefined;
  }

  const normalizedValue = await normalizeResolvedHandleCandidate(materialized, options.env);
  if (normalizedValue !== undefined) {
    return normalizedValue;
  }

  pushCompilerIssue(options.issues, {
    reason: 'proofless_resolved_value',
    message: buildProoflessResolvedValueMessage(options.toolName, options.argName),
    tool: options.toolName,
    arg: options.argName
  });
  return undefined;
}

async function normalizeResolvedBucketToolEntry(options: {
  toolName: string;
  entry: unknown;
  env: Environment;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<{ entry: unknown; resolvedArgNames: string[] } | undefined> {
  const normalizedEntry = cloneRawAuthorizationEntry(options.entry);
  if (!isPlainObject(normalizedEntry)) {
    return { entry: normalizedEntry, resolvedArgNames: [] };
  }

  const tool = options.toolContext?.get(options.toolName);
  const hasStructuredArgs = isPlainObject(normalizedEntry.args);
  const rawArgs =
    hasStructuredArgs
      ? (normalizedEntry.args as Record<string, unknown>)
      : (!hasOwnProperty(normalizedEntry, 'args') && !hasOwnProperty(normalizedEntry, 'kind')
        ? (normalizedEntry as Record<string, unknown>)
        : undefined);
  if (!rawArgs) {
    return { entry: normalizedEntry, resolvedArgNames: [] };
  }

  const nextArgs: Record<string, unknown> = {};
  const resolvedArgNames: string[] = [];
  let sawResolvedControlArg = false;

  for (const [argName, rawArgValue] of Object.entries(rawArgs)) {
    const shouldValidate =
      tool?.hasControlArgsMetadata === true && tool.controlArgs.has(argName);
    if (!shouldValidate) {
      nextArgs[argName] = rawArgValue;
      continue;
    }

    sawResolvedControlArg = true;
    const normalizedValue = await normalizeResolvedControlArgValue({
      toolName: options.toolName,
      argName,
      value: rawArgValue,
      env: options.env,
      issues: options.issues
    });
    if (normalizedValue === undefined) {
      continue;
    }

    nextArgs[argName] = normalizedValue;
    resolvedArgNames.push(argName);
  }

  if (sawResolvedControlArg && resolvedArgNames.length === 0) {
    return undefined;
  }

  return {
    entry:
      hasStructuredArgs || hasOwnProperty(normalizedEntry, 'args') || hasOwnProperty(normalizedEntry, 'kind')
        ? {
            ...normalizedEntry,
            args: nextArgs
          }
        : {
            args: nextArgs
          },
    resolvedArgNames
  };
}

async function normalizeBucketedAuthorizationIntentSource(options: {
  raw: unknown;
  rawSource: unknown;
  env: Environment;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<{ rawAuthorizations: unknown; rawSource: unknown }> {
  const container = unwrapAuthorizationIntentContainer(options.raw);
  if (!isPlainObject(container)) {
    return {
      rawAuthorizations: container,
      rawSource: options.rawSource
    };
  }

  const source = options.rawSource ?? options.raw;
  if (bucketedIntentSourceHasInfluenced(source)) {
    pushCompilerIssue(options.issues, {
      reason: 'bucketed_intent_from_influenced_source',
      message: 'Bucketed policy authorization intent cannot come from influenced input'
    });
    return {
      rawAuthorizations: undefined,
      rawSource: source
    };
  }

  const nextAllow: Record<string, unknown> = {};
  const resolvedArgKeys = new Set<string>();

  if (isPlainObject(container.allow)) {
    const explicitAllow = cloneRawAllowEntries(container.allow);
    if (isPlainObject(explicitAllow)) {
      for (const [toolName, entry] of Object.entries(explicitAllow)) {
        nextAllow[toolName] = cloneRawAuthorizationEntry(entry);
      }
    }
  }

  if (hasOwnProperty(container, 'resolved')) {
    if (!isPlainObject(container.resolved)) {
      pushCompilerIssue(options.issues, {
        reason: 'invalid_authorization',
        message: 'policy authorization intent bucket \'resolved\' must be an object'
      });
    } else {
      const resolvedAllow = cloneRawAllowEntries(container.resolved);
      if (isPlainObject(resolvedAllow)) {
        for (const [toolName, entry] of Object.entries(resolvedAllow)) {
          const normalizedEntry = await normalizeResolvedBucketToolEntry({
            toolName,
            entry,
            env: options.env,
            toolContext: options.toolContext,
            issues: options.issues
          });
          if (!normalizedEntry) {
            continue;
          }

          nextAllow[toolName] = mergeRawAuthorizationEntry(
            nextAllow[toolName],
            normalizedEntry.entry
          );
          for (const argName of normalizedEntry.resolvedArgNames) {
            resolvedArgKeys.add(`${toolName}.${argName}`);
          }
        }
      }
    }
  }

  if (Array.isArray(container.allow)) {
    for (const entry of container.allow) {
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        pushCompilerIssue(options.issues, {
          reason: 'invalid_authorization',
          message: 'policy authorization intent bucket \'allow\' must be an array of tool names'
        });
        continue;
      }
      const toolName = entry.trim();
      if (!hasOwnProperty(nextAllow, toolName)) {
        nextAllow[toolName] = true;
      }
    }
  } else if (container.allow !== undefined && !isPlainObject(container.allow)) {
    pushCompilerIssue(options.issues, {
      reason: 'invalid_authorization',
      message: 'policy authorization intent bucket \'allow\' must be an object or array of tool names'
    });
  }

  if (hasOwnProperty(container, 'known')) {
    if (!isPlainObject(container.known)) {
      pushCompilerIssue(options.issues, {
        reason: 'invalid_authorization',
        message: 'policy authorization intent bucket \'known\' must be an object'
      });
    } else {
      for (const [toolName, rawToolEntry] of Object.entries(container.known)) {
        if (!isPlainObject(rawToolEntry)) {
          pushCompilerIssue(options.issues, {
            reason: 'invalid_authorization',
            message: `Known authorization entry for '${toolName}' must be an object`,
            tool: toolName
          });
          continue;
        }

        for (const [argName, rawArgEntry] of Object.entries(rawToolEntry)) {
          if (resolvedArgKeys.has(`${toolName}.${argName}`)) {
            pushCompilerIssue(options.issues, {
              reason: 'superseded_by_resolved',
              message: `Tool '${toolName}' authorization for '${argName}' was dropped because 'resolved' already provided stronger proof`,
              tool: toolName,
              arg: argName
            });
            continue;
          }

          const descriptor = findAuthorizationIntentSourceDescriptor(source, ['known', toolName, argName]);
          if (descriptorHasInfluenced(descriptor)) {
            pushCompilerIssue(options.issues, {
              reason: 'known_from_influenced_source',
              message: `Tool '${toolName}' authorization for '${argName}' cannot mint 'known' proof from influenced input`,
              tool: toolName,
              arg: argName
            });
            continue;
          }

          const { value, hasValue } = extractKnownBucketValue(rawArgEntry);
          if (!hasValue) {
            pushCompilerIssue(options.issues, {
              reason: 'invalid_authorization',
              message: `Known authorization entry for '${toolName}.${argName}' must include 'value'`,
              tool: toolName,
              arg: argName
            });
            continue;
          }

          const args = getOrCreateRawAuthorizationArgs(nextAllow, toolName);
          if (!hasOwnProperty(args, argName)) {
            args[argName] = {
              eq: value,
              attestations: ['known']
            };
          }
        }
      }
    }
  }

  const next: Record<string, unknown> = {
    allow: nextAllow
  };
  if (hasOwnProperty(container, 'deny')) {
    next.deny = Array.isArray(container.deny) ? container.deny.slice() : container.deny;
  }

  return {
    rawAuthorizations: next,
    rawSource: next
  };
}

async function normalizeAuthorizationIntentSource(options: {
  raw: unknown;
  rawSource: unknown;
  env: Environment;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<{ rawAuthorizations: unknown; rawSource: unknown }> {
  if (hasBucketedAuthorizationIntent(options.raw) || hasBucketedAuthorizationIntent(options.rawSource)) {
    return await normalizeBucketedAuthorizationIntentSource(options);
  }

  const raw = options.raw;
  if (!isPlainObject(raw)) {
    return {
      rawAuthorizations: raw,
      rawSource: options.rawSource
    };
  }

  const container = unwrapAuthorizationIntentContainer(raw);
  if (
    Object.prototype.hasOwnProperty.call(container, 'allow')
    || Object.prototype.hasOwnProperty.call(container, 'deny')
  ) {
    const next: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(container, 'allow')) {
      next.allow = cloneRawAllowEntries(container.allow);
    }
    if (Object.prototype.hasOwnProperty.call(container, 'deny')) {
      next.deny = Array.isArray(container.deny) ? container.deny.slice() : container.deny;
    }
    return {
      rawAuthorizations: next,
      rawSource: options.rawSource
    };
  }

  return {
    rawAuthorizations: {
      allow: cloneRawAllowEntries(container)
    },
    rawSource: options.rawSource
  };
}

function cloneRawAllowEntries(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [toolName, rawEntry] of Object.entries(value)) {
    if (rawEntry === true || !isPlainObject(rawEntry)) {
      next[toolName] = rawEntry;
      continue;
    }

    const entryKeys = Object.keys(rawEntry);
    const looksLikeNestedEntry =
      entryKeys.includes('args') || entryKeys.includes('kind');
    if (!looksLikeNestedEntry) {
      next[toolName] = {
        args: { ...rawEntry }
      };
      continue;
    }

    if (!isPlainObject(rawEntry.args)) {
      next[toolName] = { ...rawEntry };
      continue;
    }

    next[toolName] = {
      ...rawEntry,
      args: { ...rawEntry.args }
    };
  }
  return next;
}

function stripNonControlArgsFromRawPolicyAuthorizations(
  rawAuthorizations: unknown,
  toolContext: ReadonlyMap<string, AuthorizationToolContext> | undefined,
  report: PolicyAuthorizationCompileReport
): void {
  const allow = isPlainObject(rawAuthorizations) && isPlainObject(rawAuthorizations.allow)
    ? rawAuthorizations.allow
    : undefined;
  if (!allow) {
    return;
  }

  for (const [toolName, entry] of Object.entries(allow)) {
    const tool = toolContext?.get(toolName);
    if (!tool?.hasControlArgsMetadata || entry === true || !isPlainObject(entry)) {
      continue;
    }

    const args = isPlainObject(entry.args) ? (entry.args as Record<string, unknown>) : undefined;
    if (!args) {
      continue;
    }

    const strippedArgs: Record<string, unknown> = {};
    for (const [argName, argValue] of Object.entries(args)) {
      if (tool.controlArgs.has(argName)) {
        strippedArgs[argName] = argValue;
      } else {
        report.strippedArgs.push({ tool: toolName, arg: argName });
      }
    }
    entry.args = strippedArgs;
  }
}

function normalizeAuthorizationProofLabels(labels: readonly string[] | undefined): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }
  return Array.from(
    new Set(labels.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))
  );
}

function hasAcceptedProofLabels(labels: readonly string[] | undefined): boolean {
  return normalizeAuthorizationProofLabels(labels).some(label =>
    DECLARED_CONTROL_ARG_KNOWN_PATTERNS.some(pattern => matchesLabelPattern(pattern, label))
  );
}

function unwrapProofValue(value: unknown): unknown {
  return isVariable(value) ? unwrapProofValue(value.value) : value;
}

function collectValueProofLabels(value: unknown): string[] {
  const descriptor = extractSecurityDescriptor(unwrapProofValue(value), {
    recursive: true,
    mergeArrayElements: true
  });
  return normalizeAuthorizationProofLabels(collectProofClaimLabels(descriptor));
}

function collectDirectValueProofLabels(value: unknown): string[] {
  const descriptor = extractSecurityDescriptor(unwrapProofValue(value), {
    recursive: false
  });
  return normalizeAuthorizationProofLabels(collectProofClaimLabels(descriptor));
}

function collectElementProofLabels(value: unknown): string[] {
  const descriptor = extractSecurityDescriptor(unwrapProofValue(value), {
    recursive: true,
    mergeArrayElements: true
  });
  return normalizeAuthorizationProofLabels(collectProofClaimLabels(descriptor));
}

function isAstObjectNode(value: unknown): value is {
  type: 'object';
  entries?: Array<{ key?: string; value?: unknown }>;
} {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'object'
      && Array.isArray((value as { entries?: unknown }).entries)
  );
}

function isAstArrayNode(value: unknown): value is {
  type: 'array';
  items?: unknown[];
} {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'array'
      && Array.isArray((value as { items?: unknown }).items)
  );
}

function getAstObjectEntryValue(node: unknown, key: string): unknown {
  if (!isAstObjectNode(node)) {
    return undefined;
  }
  return node.entries?.find(entry => entry?.key === key)?.value;
}

async function unwrapResolvedConstraintValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(value)) {
    if (extractSecurityDescriptor(value)) {
      return value;
    }
    const extracted = await extractVariableValue(value, env);
    return unwrapResolvedConstraintValue(extracted, env);
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      items.push(await unwrapResolvedConstraintValue(item, env));
    }
    return items;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await unwrapResolvedConstraintValue(entry, env);
    }
    return result;
  }
  return value;
}

async function materializePolicySourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(value)) {
    if (extractSecurityDescriptor(value)) {
      return value;
    }
    const extracted = await extractVariableValue(value, env);
    return materializePolicySourceValue(extracted, env);
  }

  if (isStructuredValue(value)) {
    if (value.type === 'array' && Array.isArray(value.data)) {
      const items: unknown[] = [];
      for (const item of value.data) {
        items.push(await materializePolicySourceValue(item, env));
      }
      return items;
    }
    if (value.type === 'object' && isPlainObject(value.data)) {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value.data)) {
        result[key] = await materializePolicySourceValue(entry, env);
      }
      return result;
    }
    return value;
  }

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      items.push(await materializePolicySourceValue(item, env));
    }
    return items;
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await materializePolicySourceValue(entry, env);
    }
    return result;
  }

  return value;
}

async function resolveConstraintSourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (candidate.type === 'VariableReference' && typeof candidate.identifier === 'string') {
      const variable = env.getVariable(candidate.identifier);
      if (!variable) {
        return (
          await repairSecurityRelevantValue({
            value: candidate,
            env,
            matchScope: 'session',
            includeSessionProofMatches: true,
            dropAmbiguousArrayElements: isArrayLikeConstraintValue(candidate),
            collapseEquivalentProjectedMatches: true
          })
        ).value;
      }
      const resolved = await resolveValueHandles(variable, env);
      const unwrapped = await unwrapResolvedConstraintValue(resolved, env);
      return (
        await repairSecurityRelevantValue({
          value: unwrapped,
          env,
          matchScope: 'session',
          includeSessionProofMatches: true,
          dropAmbiguousArrayElements: isArrayLikeConstraintValue(unwrapped),
          collapseEquivalentProjectedMatches: true
        })
      ).value;
    }
    if (isAstArrayNode(value)) {
      const items: unknown[] = [];
      for (const item of value.items ?? []) {
        items.push(await resolveConstraintSourceValue(item, env));
      }
      return (
        await repairSecurityRelevantValue({
          value: items,
          env,
          matchScope: 'session',
          includeSessionProofMatches: true,
          dropAmbiguousArrayElements: true,
          collapseEquivalentProjectedMatches: true
        })
      ).value;
    }
    if (isAstObjectNode(value)) {
      const result: Record<string, unknown> = {};
      for (const entry of value.entries ?? []) {
        if (typeof entry?.key !== 'string') {
          continue;
        }
        result[entry.key] = await resolveConstraintSourceValue(entry.value, env);
      }
      return (
        await repairSecurityRelevantValue({
          value: result,
          env,
          matchScope: 'session',
          includeSessionProofMatches: true,
          collapseEquivalentProjectedMatches: true
        })
      ).value;
    }
  }
  if (
    value &&
    typeof value === 'object' &&
    'type' in (value as Record<string, unknown>) &&
    !isStructuredValue(value)
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    const resolved = await resolveValueHandles(result.value, env);
    const unwrapped = await unwrapResolvedConstraintValue(resolved, env);
    return (
      await repairSecurityRelevantValue({
        value: unwrapped,
        env,
        matchScope: 'session',
        includeSessionProofMatches: true,
        dropAmbiguousArrayElements: isArrayLikeConstraintValue(unwrapped),
        collapseEquivalentProjectedMatches: true
      })
    ).value;
  }
  const resolved = await resolveValueHandles(value, env);
  const unwrapped = await unwrapResolvedConstraintValue(resolved, env);
  return (
    await repairSecurityRelevantValue({
      value: unwrapped,
      env,
      matchScope: 'session',
      includeSessionProofMatches: true,
      dropAmbiguousArrayElements: isArrayLikeConstraintValue(unwrapped),
      collapseEquivalentProjectedMatches: true
    })
  ).value;
}

async function extractConstraintAttestations(
  value: unknown,
  env: Environment
): Promise<string[]> {
  const resolvedValue = await resolveConstraintSourceValue(value, env);
  const descriptor = extractSecurityDescriptor(resolvedValue, {
    recursive: true,
    mergeArrayElements: true
  });
  return normalizeAuthorizationProofLabels(collectProofClaimLabels(descriptor));
}

async function extractConstraintAttestationsSafe(
  value: unknown,
  env: Environment
): Promise<string[]> {
  try {
    return await extractConstraintAttestations(value, env);
  } catch (error) {
    if (isAmbiguousProjectedValueError(error)) {
      return [];
    }
    throw error;
  }
}

function getRawAuthorizationAllowObject(source: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(source)) {
    return undefined;
  }

  const container =
    isPlainObject(source.authorizations)
      ? source.authorizations
      : source;
  if (
    Object.prototype.hasOwnProperty.call(container, 'allow')
    || Object.prototype.hasOwnProperty.call(container, 'deny')
  ) {
    return isPlainObject(container.allow) ? (container.allow as Record<string, unknown>) : undefined;
  }
  return container;
}

function getRawAuthorizationAllowNode(source: unknown): unknown {
  const authorizationsNode = getAstObjectEntryValue(source, 'authorizations');
  const containerNode = authorizationsNode ?? source;
  const explicitAllowNode = getAstObjectEntryValue(containerNode, 'allow');
  const hasAuthorizationsShape =
    authorizationsNode !== undefined
    || getAstObjectEntryValue(source, 'allow') !== undefined
    || getAstObjectEntryValue(source, 'deny') !== undefined;

  if (explicitAllowNode !== undefined) {
    return explicitAllowNode;
  }

  return hasAuthorizationsShape ? undefined : source;
}

async function compileAuthorizationAttestations(
  rawAuthorizationSource: unknown,
  normalizedAuthorizations: PolicyAuthorizations | undefined,
  env: Environment,
  report: PolicyAuthorizationCompileReport
): Promise<void> {
  const rawValue = isStructuredValue(rawAuthorizationSource) ? asData(rawAuthorizationSource) : rawAuthorizationSource;
  const sourceValue =
    isAstObjectNode(rawValue) || isAstArrayNode(rawValue)
      ? rawValue
      : await materializePolicySourceValue(rawValue, env);
  const rawAllow = getRawAuthorizationAllowObject(sourceValue);
  const rawAllowNode = getRawAuthorizationAllowNode(sourceValue);

  if (!normalizedAuthorizations?.allow || (!rawAllow && !rawAllowNode)) {
    return;
  }

  for (const [toolName, entry] of Object.entries(normalizedAuthorizations.allow)) {
    if (entry.kind !== 'constrained') {
      continue;
    }
    try {
      const rawEntry = rawAllow?.[toolName];
      const rawArgsObject =
        isPlainObject(rawEntry)
          ? (
              isPlainObject(rawEntry.args)
                ? (rawEntry.args as Record<string, unknown>)
                : (rawEntry as Record<string, unknown>)
            )
          : undefined;
      const rawToolNode = getAstObjectEntryValue(rawAllowNode, toolName);
      const rawArgsNode = getAstObjectEntryValue(rawToolNode, 'args') ?? rawToolNode;
      if (!rawArgsObject && !rawArgsNode) {
        continue;
      }

      for (const [argName, clauses] of Object.entries(entry.args)) {
        const rawConstraint = rawArgsObject?.[argName] ?? getAstObjectEntryValue(rawArgsNode, argName);
        if (rawConstraint === undefined) {
          continue;
        }

        entry.args[argName] = await Promise.all(clauses.map(async clause => {
          if ('eq' in clause) {
            const rawEqValue =
              isPlainObject(rawConstraint) && Object.prototype.hasOwnProperty.call(rawConstraint, 'eq')
                ? rawConstraint.eq
                : getAstObjectEntryValue(rawConstraint, 'eq') ?? rawConstraint;
            let compiledAttestations =
              Array.isArray(rawEqValue)
                ? Array.from(
                    new Set(
                      (
                        await Promise.all(
                          rawEqValue.map(candidate => extractConstraintAttestationsSafe(candidate, env))
                        )
                      ).flat()
                    )
                  )
                : await extractConstraintAttestationsSafe(rawEqValue, env);
            if (compiledAttestations.length === 0) {
              compiledAttestations =
                Array.isArray(clause.eq)
                  ? Array.from(
                      new Set(
                        (
                          await Promise.all(
                            clause.eq.map(candidate => extractConstraintAttestationsSafe(candidate, env))
                          )
                        ).flat()
                      )
                    )
                  : await extractConstraintAttestationsSafe(clause.eq, env);
            }
            if (compiledAttestations.length === 0) {
              return clause;
            }
            report.compiledProofs.push({
              tool: toolName,
              arg: argName,
              labels: [...compiledAttestations]
            });
            return {
              ...clause,
              attestations: compiledAttestations
            };
          }

          const rawOneOfCandidates =
            isPlainObject(rawConstraint) && Array.isArray(rawConstraint.oneOf)
              ? rawConstraint.oneOf
              : isAstArrayNode(getAstObjectEntryValue(rawConstraint, 'oneOf'))
                ? (getAstObjectEntryValue(rawConstraint, 'oneOf') as { items: unknown[] }).items
                : clause.oneOf;
          let oneOfAttestations = await Promise.all(
            rawOneOfCandidates.map(candidate => extractConstraintAttestationsSafe(candidate, env))
          );
          if (!oneOfAttestations.some(entry => entry.length > 0)) {
            oneOfAttestations = await Promise.all(
              clause.oneOf.map(candidate => extractConstraintAttestationsSafe(candidate, env))
            );
          }
          if (!oneOfAttestations.some(entry => entry.length > 0)) {
            return clause;
          }
          report.compiledProofs.push({
            tool: toolName,
            arg: argName,
            labels: Array.from(new Set(oneOfAttestations.flatMap(entry => entry)))
          });
          return {
            ...clause,
            oneOfAttestations
          };
        }));
      }
    } catch (error) {
      if (isAmbiguousProjectedValueError(error)) {
        report.droppedEntries.push({
          tool: toolName,
          reason: 'ambiguous_projected_value'
        });
        delete normalizedAuthorizations.allow[toolName];
        continue;
      }
      throw error;
    }
  }
}

async function canonicalizePolicyAuthorizationConstraints(
  rawAuthorizations: unknown,
  env: Environment,
  policy: PolicyConfig | undefined,
  report: PolicyAuthorizationCompileReport
): Promise<void> {
  const allow = isPlainObject(rawAuthorizations) && isPlainObject(rawAuthorizations.allow)
    ? (rawAuthorizations.allow as Record<string, unknown>)
    : undefined;
  if (!allow) {
    return;
  }

  for (const [toolName, entry] of Object.entries(allow)) {
    if (!isPlainObject(entry) || !isPlainObject(entry.args)) {
      continue;
    }

    const targetArgNames = collectSecurityRelevantArgNamesForOperation({
      env,
      operationName: toolName,
      policy
    });

    for (const [argName, argValue] of Object.entries(entry.args)) {
      const shouldCanonicalize =
        targetArgNames.includes(argName) || containsBareHandleToken(argValue);
      if (!shouldCanonicalize) {
        continue;
      }
      try {
        const repaired = await repairSecurityRelevantValue({
          value: argValue,
          env,
          matchScope: 'session',
          includeSessionProofMatches: true,
          dropAmbiguousArrayElements: isArrayLikeConstraintValue(argValue),
          collapseEquivalentProjectedMatches: true
        });
        entry.args[argName] = repaired.value;
        for (const event of repaired.events) {
          if (event.kind !== 'dropped_ambiguous_array_element') {
            continue;
          }
          report.droppedArrayElements.push({
            tool: toolName,
            arg: argName,
            index: event.index,
            reason: 'ambiguous_projected_value',
            value: event.value
          });
          report.ambiguousValues.push({
            tool: toolName,
            arg: argName,
            value: event.value
          });
        }
        const repairSteps = repaired.events
          .filter(
            event =>
              event.kind !== 'ambiguous_projected_value'
              && event.kind !== 'dropped_ambiguous_array_element'
          )
          .map(runtimeRepairEventLabel);
        if (repairSteps.length > 0) {
          report.repairedArgs.push({
            tool: toolName,
            arg: argName,
            steps: Array.from(new Set(repairSteps))
          });
        }
      } catch (error) {
        if (isAmbiguousProjectedValueError(error)) {
          report.droppedEntries.push({
            tool: toolName,
            reason: 'ambiguous_projected_value'
          });
          report.ambiguousValues.push({
            tool: toolName,
            arg: argName,
            value: typeof argValue === 'string' ? argValue : String(argValue)
          });
          delete allow[toolName];
          break;
        }
        throw error;
      }
    }
  }
}

function mapValidationIssueReason(
  issue: PolicyAuthorizationIssue
): PolicyAuthorizationCompilerIssue['reason'] {
  switch (issue.code) {
    case 'authorizations-missing-tool-context':
      return 'missing_tool_context';
    case 'authorizations-unknown-tool':
      return 'unknown_tool';
    case 'authorizations-denied-tool':
      return 'denied_by_policy';
    case 'authorizations-unconstrained-control-args':
      return 'requires_control_args';
    case 'authorizations-unknown-arg':
      return 'unknown_arg';
    default:
      return 'invalid_authorization';
  }
}

function pushCompilerIssue(
  issues: PolicyAuthorizationCompilerIssue[],
  issue: PolicyAuthorizationCompilerIssue
): void {
  const exists = issues.some(existing =>
    existing.reason === issue.reason
    && existing.message === issue.message
    && existing.tool === issue.tool
    && existing.arg === issue.arg
    && existing.element === issue.element
  );
  if (!exists) {
    issues.push(issue);
  }
}

function deleteToolAuthorization(
  authorizations: PolicyAuthorizations | undefined,
  toolName: string
): void {
  if (!authorizations?.allow) {
    return;
  }
  delete authorizations.allow[toolName];
}

function filterBuilderValidationErrors(
  authorizations: PolicyAuthorizations | undefined,
  validation: PolicyAuthorizationValidationResult,
  issues: PolicyAuthorizationCompilerIssue[]
): void {
  let sawGlobalError = false;
  for (const error of validation.errors) {
    pushCompilerIssue(issues, {
      reason: mapValidationIssueReason(error),
      message: error.message,
      ...(error.tool ? { tool: error.tool } : {}),
      ...(error.arg ? { arg: error.arg } : {})
    });
    if (error.tool) {
      deleteToolAuthorization(authorizations, error.tool);
    } else {
      sawGlobalError = true;
    }
  }

  if (sawGlobalError && authorizations?.allow) {
    for (const toolName of Object.keys(authorizations.allow)) {
      delete authorizations.allow[toolName];
    }
  }
}

function validateAuthorizationsOrThrow(
  validation: PolicyAuthorizationValidationResult,
  report: PolicyAuthorizationCompileReport
): void {
  if (validation.errors.length === 0) {
    return;
  }

  throw new MlldSecurityError(
    validation.errors[0]?.message ?? 'policy.authorizations validation failed',
    {
      code: 'POLICY_AUTHORIZATIONS_INVALID',
      details: {
        errors: validation.errors,
        warnings: validation.warnings,
        report
      }
    }
  );
}

function isFatalRuntimeCompilerIssue(issue: PolicyAuthorizationCompilerIssue): boolean {
  return issue.reason !== 'superseded_by_resolved';
}

function buildProoflessIssueMessage(toolName: string, argName: string, element?: number): string {
  if (typeof element === 'number') {
    return `Tool '${toolName}' authorization for '${argName}[${element}]' lacks required proof`;
  }
  return `Tool '${toolName}' authorization for '${argName}' lacks required proof`;
}

async function enforceEqClauseProof(options: {
  toolName: string;
  argName: string;
  clause: Extract<AuthorizationConstraintClause, { eq: unknown }>;
  env: Environment;
  mode: 'builder' | 'runtime';
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<AuthorizationConstraintClause | undefined> {
  if (hasAcceptedProofLabels(options.clause.attestations)) {
    return options.clause;
  }
  const repairedEq = (
    await repairSecurityRelevantValue({
      value: options.clause.eq,
      env: options.env,
      matchScope: 'session',
      includeSessionProofMatches: true,
      collapseEquivalentProjectedMatches: true,
      dropAmbiguousArrayElements: Array.isArray(options.clause.eq)
    })
  ).value;

  if (hasAcceptedProofLabels(collectDirectValueProofLabels(repairedEq))) {
    return {
      ...options.clause,
      eq: repairedEq
    };
  }
  if (!Array.isArray(repairedEq) && hasAcceptedProofLabels(collectValueProofLabels(repairedEq))) {
    return {
      ...options.clause,
      eq: repairedEq
    };
  }

  if (hasAcceptedProofLabels(collectDirectValueProofLabels(options.clause.eq))) {
    return options.clause;
  }

  if (Array.isArray(repairedEq)) {
    const retained: unknown[] = [];
    let sawInvalidElement = false;
    for (let index = 0; index < repairedEq.length; index += 1) {
      const element = repairedEq[index];
      if (hasAcceptedProofLabels(collectElementProofLabels(element))) {
        retained.push(element);
        continue;
      }

      sawInvalidElement = true;
      pushCompilerIssue(options.issues, {
        reason: 'proofless_control_arg',
        message: buildProoflessIssueMessage(options.toolName, options.argName, index),
        tool: options.toolName,
        arg: options.argName,
        element: index
      });
    }

    if (!sawInvalidElement) {
      return options.clause;
    }
    if (options.mode === 'runtime') {
      return undefined;
    }
    if (retained.length === 0) {
      return undefined;
    }
    return {
      ...options.clause,
      eq: retained
    };
  }

  pushCompilerIssue(options.issues, {
    reason: 'proofless_control_arg',
    message: buildProoflessIssueMessage(options.toolName, options.argName),
    tool: options.toolName,
    arg: options.argName
  });
  return undefined;
}

async function enforceOneOfClauseProof(options: {
  toolName: string;
  argName: string;
  clause: Extract<AuthorizationConstraintClause, { oneOf: unknown[] }>;
  env: Environment;
  mode: 'builder' | 'runtime';
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<AuthorizationConstraintClause | undefined> {
  const retainedValues: unknown[] = [];
  const retainedAttestations: string[][] = [];
  let sawInvalid = false;

  for (let index = 0; index < options.clause.oneOf.length; index += 1) {
    const candidate = options.clause.oneOf[index];
    const candidateAttestations = normalizeAuthorizationProofLabels(
      options.clause.oneOfAttestations?.[index]
    );
    const repairedCandidate = (
      await repairSecurityRelevantValue({
        value: candidate,
        env: options.env,
        matchScope: 'session',
        includeSessionProofMatches: true,
        collapseEquivalentProjectedMatches: true,
        dropAmbiguousArrayElements: Array.isArray(candidate)
      })
    ).value;
    if (
      hasAcceptedProofLabels(candidateAttestations)
      || hasAcceptedProofLabels(collectDirectValueProofLabels(repairedCandidate))
      || (!Array.isArray(repairedCandidate) && hasAcceptedProofLabels(collectValueProofLabels(repairedCandidate)))
    ) {
      retainedValues.push(repairedCandidate);
      retainedAttestations.push(candidateAttestations);
      continue;
    }

    sawInvalid = true;
    pushCompilerIssue(options.issues, {
      reason: 'proofless_control_arg',
      message: buildProoflessIssueMessage(options.toolName, options.argName, index),
      tool: options.toolName,
      arg: options.argName,
      element: index
    });
  }

  if (!sawInvalid) {
    return options.clause;
  }
  if (options.mode === 'runtime' || retainedValues.length === 0) {
    return undefined;
  }

  return {
    oneOf: retainedValues,
    ...(retainedAttestations.some(entry => entry.length > 0)
      ? { oneOfAttestations: retainedAttestations }
      : {})
  };
}

async function enforceControlArgProof(options: {
  authorizations: PolicyAuthorizations | undefined;
  env: Environment;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  mode: 'builder' | 'runtime';
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<void> {
  const allow = options.authorizations?.allow;
  if (!allow) {
    return;
  }

  for (const [toolName, entry] of Object.entries({ ...allow })) {
    const tool = options.toolContext?.get(toolName);
    if (!tool || entry.kind !== 'constrained') {
      continue;
    }

    const effectiveControlArgs = tool.hasControlArgsMetadata ? tool.controlArgs : tool.params;
    let toolInvalid = false;
    let sawValidatedControlArg = false;

    for (const argName of [...Object.keys(entry.args)]) {
      if (!effectiveControlArgs.has(argName)) {
        continue;
      }
      sawValidatedControlArg = true;

      const nextClauses: AuthorizationConstraintClause[] = [];
      for (const clause of entry.args[argName] ?? []) {
        const nextClause =
          'eq' in clause
            ? await enforceEqClauseProof({
                toolName,
                argName,
                clause,
                env: options.env,
                mode: options.mode,
                issues: options.issues
              })
            : await enforceOneOfClauseProof({
                toolName,
                argName,
                clause,
                env: options.env,
                mode: options.mode,
                issues: options.issues
              });

        if (nextClause) {
          nextClauses.push(nextClause);
        } else {
          toolInvalid = true;
          if (options.mode === 'runtime') {
            break;
          }
        }
      }

      if (toolInvalid && options.mode === 'runtime') {
        break;
      }

      if (nextClauses.length > 0) {
        entry.args[argName] = nextClauses;
      } else {
        delete entry.args[argName];
      }
    }

    if (toolInvalid || (sawValidatedControlArg && Object.keys(entry.args).length === 0)) {
      delete allow[toolName];
    }
  }
}

function validationOptionsForCompiler(options: CompilePolicyAuthorizationsOptions): {
  requireKnownTools: boolean;
  requireControlArgsMetadata: boolean;
  deniedTools: readonly string[];
} {
  return {
    requireKnownTools: options.mode === 'builder',
    requireControlArgsMetadata: options.mode === 'builder',
    deniedTools: options.ambientDeniedTools ?? []
  };
}

export async function compilePolicyAuthorizations(
  options: CompilePolicyAuthorizationsOptions
): Promise<CompilePolicyAuthorizationsResult> {
  const report = createEmptyPolicyAuthorizationCompileReport();
  const issues: PolicyAuthorizationCompilerIssue[] = [];

  const normalizedIntent = await normalizeAuthorizationIntentSource({
    raw: options.rawAuthorizations,
    rawSource: options.rawSource ?? options.rawAuthorizations,
    env: options.env,
    toolContext: options.toolContext,
    issues
  });
  const rawAuthorizations = normalizedIntent.rawAuthorizations;
  if (rawAuthorizations === undefined || rawAuthorizations === null) {
    return { authorizations: undefined, issues, report };
  }

  stripNonControlArgsFromRawPolicyAuthorizations(rawAuthorizations, options.toolContext, report);
  await canonicalizePolicyAuthorizationConstraints(
    rawAuthorizations,
    options.env,
    options.policy,
    report
  );

  const normalized = normalizePolicyAuthorizations(
    rawAuthorizations,
    undefined,
    options.toolContext
  );

  if (!normalized) {
    const validation = validatePolicyAuthorizations(
      rawAuthorizations,
      options.toolContext,
      validationOptionsForCompiler(options)
    );
    if (options.mode === 'runtime') {
      validateAuthorizationsOrThrow(validation, report);
    }
    filterBuilderValidationErrors(undefined, validation, issues);
    return { authorizations: undefined, issues, report };
  }

  const validation = validateNormalizedPolicyAuthorizations(
    normalized,
    options.toolContext,
    validationOptionsForCompiler(options)
  );
  if (options.mode === 'runtime') {
    validateAuthorizationsOrThrow(validation, report);
  } else {
    filterBuilderValidationErrors(normalized, validation, issues);
  }

  await compileAuthorizationAttestations(
    normalizedIntent.rawSource,
    normalized,
    options.env,
    report
  );

  await enforceControlArgProof({
    authorizations: normalized,
    env: options.env,
    toolContext: options.toolContext,
    mode: options.mode,
    issues
  });

  if (options.mode === 'runtime' && issues.some(isFatalRuntimeCompilerIssue)) {
    throw new MlldSecurityError(
      issues.find(isFatalRuntimeCompilerIssue)?.message ?? 'policy.authorizations validation failed',
      {
        code: 'POLICY_AUTHORIZATIONS_INVALID',
        details: {
          issues,
          report
        }
      }
    );
  }

  if (options.mode === 'builder') {
    for (const dropped of report.droppedEntries) {
      pushCompilerIssue(issues, {
        reason: dropped.reason === 'ambiguous_projected_value'
          ? 'ambiguous_projected_value'
          : 'invalid_authorization',
        message:
          dropped.reason === 'ambiguous_projected_value'
            ? `Tool '${dropped.tool}' authorization was dropped because its value resolved ambiguously`
            : `Tool '${dropped.tool}' authorization was dropped`,
        tool: dropped.tool
      });
      deleteToolAuthorization(normalized, dropped.tool);
    }
  }

  return {
    authorizations: normalized,
    issues,
    report
  };
}
