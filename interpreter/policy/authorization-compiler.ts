import {
  normalizePolicyAuthorizations,
  setAuthorizationConstraintClauseEqFactsources,
  setAuthorizationConstraintClauseOneOfFactsources,
  validateNormalizedPolicyAuthorizations,
  validatePolicyAuthorizations,
  type AuthorizationConstraintClause,
  type AuthorizationToolContext,
  type PolicyAuthorizationIssue,
  type PolicyAuthorizationValidationResult,
  type PolicyAuthorizations
} from '@core/policy/authorizations';
import type { MlldNode, VariableReferenceNode } from '@core/types';
import {
  isFactSourceHandle,
  isHandleWrapper,
  type FactSourceHandle
} from '@core/types/handle';
import { DECLARED_CONTROL_ARG_KNOWN_PATTERNS } from '@core/policy/fact-requirements';
import { matchesLabelPattern } from '@core/policy/fact-labels';
import { normalizeNamedOperationRef } from '@core/policy/operation-labels';
import type { PolicyConfig } from '@core/policy/union';
import { MlldSecurityError } from '@core/errors';
import { makeSecurityDescriptor } from '@core/types/security';
import { collectProofClaimLabels } from '@interpreter/security/proof-claims';
import { proofStrengthForValue } from '@interpreter/security/proof-claims';
import { encodeCanonicalValue } from '@interpreter/security/canonical-value';
import {
  collectSecurityRelevantArgNamesForOperation,
  repairSecurityRelevantValue,
  type RuntimeRepairEvent
} from '@interpreter/security/runtime-repair';
import type { Environment } from '@interpreter/env/Environment';
import {
  asData,
  asText,
  applySecurityDescriptorToStructuredValue,
  ensureStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { boundary } from '@interpreter/utils/boundary';
import { getStaticObjectKey } from '@interpreter/utils/object-compat';
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
    | 'known_not_in_task'
    | 'no_update_fields'
    | 'payload_not_in_task'
    | 'known_contains_handle'
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
  taskText?: string;
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

function hasBucketedAuthorizationIntent(
  raw: unknown,
  options: { allowToolObjectBucket?: boolean } = {}
): boolean {
  const container = unwrapAuthorizationIntentContainer(raw);
  if (!isPlainObject(container)) {
    return false;
  }
  return (
    hasOwnProperty(container, 'resolved')
    || hasOwnProperty(container, 'known')
    || Array.isArray(container.allow)
    || (
      options.allowToolObjectBucket === true
      && !hasOwnProperty(container, 'deny')
      && isPlainObject(container.allow)
      && Object.values(container.allow).every(entry => entry === true)
    )
  );
}

const HANDLE_TOKEN_RE = /^h_[a-z0-9]+$/;

function extractHandleTokenCandidate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const handle = value.trim();
    return HANDLE_TOKEN_RE.test(handle) ? handle : undefined;
  }

  if (isStructuredValue(value)) {
    const data = value.data;
    if (typeof data === 'string') {
      const handle = data.trim();
      if (HANDLE_TOKEN_RE.test(handle)) {
        return handle;
      }
    }

    const text = asText(value).trim();
    return HANDLE_TOKEN_RE.test(text) ? text : undefined;
  }

  return undefined;
}

function getKnownTaskValidationArgs(
  tool: AuthorizationToolContext | undefined
): Set<string> | undefined {
  if (!tool) {
    return undefined;
  }
  return tool.hasControlArgsMetadata ? tool.controlArgs : tool.params;
}

function buildKnownNotInTaskMessage(literal: string): string {
  return `Known literal '${literal}' not found in task text`;
}

function buildPayloadNotInTaskMessage(argName: string, literal: string): string {
  return `Payload literal '${literal}' for '${argName}' not found in task text`;
}

function validateLiteralValueAgainstTask(options: {
  toolName: string;
  argName: string;
  value: unknown;
  normalizedTaskText: string;
  issues: PolicyAuthorizationCompilerIssue[];
  reason: 'known_not_in_task' | 'payload_not_in_task';
  buildMessage: (literal: string) => string;
  rejectHandleWrappers: boolean;
}): boolean {
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || candidate === undefined) {
      return true;
    }

    if (Array.isArray(candidate)) {
      let valid = true;
      for (const entry of candidate) {
        valid = visit(entry) && valid;
      }
      return valid;
    }

    if (isStructuredValue(candidate)) {
      if (candidate.type === 'array' && Array.isArray(candidate.data)) {
        return visit(candidate.data);
      }
      if (candidate.type === 'object' && isPlainObject(candidate.data)) {
        return visit(candidate.data);
      }
      return visit(candidate.data);
    }

    if (isPlainObject(candidate)) {
      let valid = true;
      if (hasOwnProperty(candidate, 'eq')) {
        return visit((candidate as Record<string, unknown>).eq) && valid;
      }
      if (hasOwnProperty(candidate, 'oneOf')) {
        return visit((candidate as Record<string, unknown>).oneOf) && valid;
      }

      if (
        hasOwnProperty(candidate, 'handle')
        && options.rejectHandleWrappers
        && extractHandleTokenCandidate((candidate as Record<string, unknown>).handle) !== undefined
      ) {
        pushCompilerIssue(options.issues, {
          reason: 'known_contains_handle',
          message: 'Handle wrappers belong in resolved, not known',
          tool: options.toolName,
          arg: options.argName
        });
        valid = false;
      }

      if (hasOwnProperty(candidate, 'value') || hasOwnProperty(candidate, 'source')) {
        if (hasOwnProperty(candidate, 'value')) {
          valid = visit((candidate as Record<string, unknown>).value) && valid;
        }
        return valid;
      }

      for (const nested of Object.values(candidate)) {
        valid = visit(nested) && valid;
      }
      return valid;
    }

    if (typeof candidate !== 'string' && typeof candidate !== 'number') {
      return true;
    }

    const literal = String(candidate).trim();
    if (literal.length === 0) {
      return true;
    }
    if (options.normalizedTaskText.includes(literal.toLowerCase())) {
      return true;
    }

    pushCompilerIssue(options.issues, {
      reason: options.reason,
      message: options.buildMessage(literal),
      tool: options.toolName,
      arg: options.argName
    });
    return false;
  };

  return visit(options.value);
}

function validateKnownValueAgainstTask(options: {
  toolName: string;
  argName: string;
  value: unknown;
  normalizedTaskText: string;
  issues: PolicyAuthorizationCompilerIssue[];
}): boolean {
  return validateLiteralValueAgainstTask({
    ...options,
    reason: 'known_not_in_task',
    buildMessage: buildKnownNotInTaskMessage,
    rejectHandleWrappers: true
  });
}

function validateExactPayloadValueAgainstTask(options: {
  toolName: string;
  argName: string;
  value: unknown;
  normalizedTaskText: string;
  issues: PolicyAuthorizationCompilerIssue[];
}): boolean {
  return validateLiteralValueAgainstTask({
    ...options,
    reason: 'payload_not_in_task',
    buildMessage: literal => buildPayloadNotInTaskMessage(options.argName, literal),
    rejectHandleWrappers: false
  });
}

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

function deriveKnownHandlePreview(value: unknown): string | undefined {
  const text =
    isStructuredValue(value)
      ? asText(value).trim()
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value).trim()
        : '';
  return text.length > 0 ? text : undefined;
}

function createKnownHandleValue(value: unknown): unknown {
  const wrapped =
    isStructuredValue(value)
      ? wrapStructured(value.data, value.type, value.text, value.metadata)
      : ensureStructuredValue(value);
  if (isStructuredValue(value) && value.internal) {
    wrapped.internal = { ...value.internal };
  }
  applySecurityDescriptorToStructuredValue(
    wrapped,
    makeSecurityDescriptor({
      attestations: ['known']
    })
  );
  return wrapped;
}

function entryHasFactProof(value: unknown): boolean {
  if (proofStrengthForValue(value) < 3) {
    return false;
  }
  return collectProofClaimLabels(
    extractSecurityDescriptor(value, {
      recursive: true,
      mergeArrayElements: true
    })
  ).some(label => label.startsWith('fact:'));
}

function normalizeKnownHandleOp(value: string): string {
  return normalizeNamedOperationRef(value) ?? value.trim();
}

function findUniqueFactBackedHandleMatch(
  env: Environment,
  value: unknown
): string | undefined {
  const matches = env.findIssuedHandlesByCanonicalValue(value)
    .filter(entry => entryHasFactProof(entry.value));
  return matches.length === 1 ? matches[0]!.handle : undefined;
}

function findReusableKnownHandleMatch(options: {
  env: Environment;
  value: unknown;
  toolName: string;
  argName: string;
}): string | undefined {
  const normalizedOp = normalizeKnownHandleOp(options.toolName);
  const matches = options.env.findIssuedHandlesByCanonicalValue(options.value).filter(entry =>
    entry.metadata?.proof === 'known'
    && entry.metadata?.op === normalizedOp
    && entry.metadata?.arg === options.argName
  );
  return matches.length > 0 ? matches[0]!.handle : undefined;
}

function registerKnownHandle(options: {
  env: Environment;
  toolName: string;
  argName: string;
  value: unknown;
}): void {
  const preview = deriveKnownHandlePreview(options.value);
  options.env.issueHandle(createKnownHandleValue(options.value), {
    ...(preview ? { preview } : {}),
    metadata: {
      proof: 'known',
      op: normalizeKnownHandleOp(options.toolName),
      arg: options.argName
    }
  });
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
  const directHandle = extractHandleTokenCandidate(value);
  if (directHandle) {
    env.resolveHandle(directHandle);
    return directHandle;
  }

  if (isHandleWrapper(value)) {
    const handle = value.handle.trim();
    if (!HANDLE_TOKEN_RE.test(handle)) {
      return undefined;
    }
    env.resolveHandle(handle);
    return handle === value.handle
      ? value
      : { handle };
  }

  if (!isPlainObject(value) || Array.isArray(value) || !hasOwnProperty(value, 'handle')) {
    return undefined;
  }

  const wrappedHandle = extractHandleTokenCandidate((value as { handle?: unknown }).handle);
  if (!wrappedHandle) {
    return undefined;
  }

  env.resolveHandle(wrappedHandle);
  return { handle: wrappedHandle };
}

async function normalizeResolvedControlArgValue(options: {
  toolName: string;
  argName: string;
  value: unknown;
  env: Environment;
  mode: 'builder' | 'runtime';
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

      if (entryHasFactProof(materialized[index])) {
        retained.push(materialized[index]);
        continue;
      }

      const liftedMatch =
        options.mode === 'builder'
          ? await findUniqueFactBackedValueMatch(options.env, materialized[index])
          : undefined;
      if (liftedMatch !== undefined) {
        retained.push(liftedMatch);
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

  if (entryHasFactProof(materialized)) {
    return materialized;
  }

  const liftedMatch =
    options.mode === 'builder'
      ? await findUniqueFactBackedValueMatch(options.env, materialized)
      : undefined;
  if (liftedMatch !== undefined) {
    return liftedMatch;
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
  mode: 'builder' | 'runtime';
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
      mode: options.mode,
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

type NormalizedAuthorizationIntentSource = {
  rawAuthorizations: unknown;
  rawSource: unknown;
  toolLevelAllowTools: Set<string>;
};

async function materializeAuthorizationIntentSourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(value) && extractSecurityDescriptor(value)) {
    return value;
  }

  return materializePolicySourceValue(value, env);
}

async function normalizeBucketedAuthorizationIntentSource(options: {
  raw: unknown;
  rawSource: unknown;
  env: Environment;
  mode: 'builder' | 'runtime';
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<NormalizedAuthorizationIntentSource> {
  const container = unwrapAuthorizationIntentContainer(options.raw);
  if (!isPlainObject(container)) {
    return {
      rawAuthorizations: container,
      rawSource: options.rawSource,
      toolLevelAllowTools: new Set<string>()
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
      rawSource: source,
      toolLevelAllowTools: new Set<string>()
    };
  }

  const topLevelFields = Object.keys(container).filter(
    key => key !== 'resolved' && key !== 'known' && key !== 'allow' && key !== 'deny'
  );
  if (topLevelFields.length > 0) {
    const mixedToolEntries = topLevelFields.filter(field => options.toolContext?.has(field));
    const unrecognizedFields = topLevelFields.filter(field => !options.toolContext?.has(field));

    if (mixedToolEntries.length > 0) {
      pushCompilerIssue(options.issues, {
        reason: 'invalid_authorization',
        message:
          `Cannot mix flat tool entries with bucketed authorization fields; found top-level tool entries: ${mixedToolEntries.join(', ')}`
      });
    }

    for (const field of unrecognizedFields) {
      pushCompilerIssue(options.issues, {
        reason: 'invalid_authorization',
        message:
          `Unrecognized authorization field '${field}'; expected one of: resolved, known, allow, or a tool name`
      });
    }

    return {
      rawAuthorizations: {
        allow: {}
      },
      rawSource: {
        allow: {}
      },
      toolLevelAllowTools: new Set<string>()
    };
  }

  const nextAllow: Record<string, unknown> = {};
  const resolvedArgKeys = new Set<string>();
  const toolLevelAllowTools = new Set<string>();
  const normalizedTaskText =
    typeof options.taskText === 'string' && options.taskText.trim().length > 0
      ? options.taskText.trim().toLowerCase()
      : undefined;

  if (isPlainObject(container.allow)) {
    for (const [toolName, entry] of Object.entries(container.allow)) {
      if (entry === true) {
        nextAllow[toolName] = true;
        toolLevelAllowTools.add(toolName);
        continue;
      }

      nextAllow[toolName] = cloneRawAuthorizationEntry(entry);
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
            mode: options.mode,
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
          toolLevelAllowTools.delete(toolName);
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

        const knownTaskValidationArgs = getKnownTaskValidationArgs(
          options.toolContext?.get(toolName)
        );
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

          const materializedValue = await materializePolicySourceValue(value, options.env);
          if (
            normalizedTaskText
            && knownTaskValidationArgs?.has(argName)
            && !validateKnownValueAgainstTask({
              toolName,
              argName,
              value: materializedValue,
              normalizedTaskText,
              issues: options.issues
            })
          ) {
            continue;
          }

          const upgradedHandle = findUniqueFactBackedHandleMatch(options.env, materializedValue);
          if (upgradedHandle) {
            const args = getOrCreateRawAuthorizationArgs(nextAllow, toolName);
            toolLevelAllowTools.delete(toolName);
            if (!hasOwnProperty(args, argName)) {
              args[argName] = {
                eq: { handle: upgradedHandle }
              };
            }
            continue;
          }

          const reusableKnownHandle = findReusableKnownHandleMatch({
            env: options.env,
            value: materializedValue,
            toolName,
            argName
          });
          if (!reusableKnownHandle) {
            registerKnownHandle({
              env: options.env,
              toolName,
              argName,
              value: materializedValue
            });
          }

          const args = getOrCreateRawAuthorizationArgs(nextAllow, toolName);
          toolLevelAllowTools.delete(toolName);
          if (!hasOwnProperty(args, argName)) {
            args[argName] = {
              eq: materializedValue,
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
    rawSource: next,
    toolLevelAllowTools
  };
}

async function normalizeAuthorizationIntentSource(options: {
  raw: unknown;
  rawSource: unknown;
  env: Environment;
  mode: 'builder' | 'runtime';
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
  issues: PolicyAuthorizationCompilerIssue[];
}): Promise<NormalizedAuthorizationIntentSource> {
  const bucketDetectionOptions = {
    allowToolObjectBucket: options.mode === 'builder'
  };
  if (
    hasBucketedAuthorizationIntent(options.raw, bucketDetectionOptions)
    || hasBucketedAuthorizationIntent(options.rawSource, bucketDetectionOptions)
  ) {
    return await normalizeBucketedAuthorizationIntentSource(options);
  }

  const raw = options.raw;
  if (!isPlainObject(raw)) {
    return {
      rawAuthorizations: raw,
      rawSource:
        options.mode === 'builder'
          ? await materializeAuthorizationIntentSourceValue(options.rawSource, options.env)
          : options.rawSource,
      toolLevelAllowTools: new Set<string>()
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
      rawSource:
        options.mode === 'builder'
          ? await materializeAuthorizationIntentSourceValue(options.rawSource, options.env)
          : options.rawSource,
      toolLevelAllowTools: new Set<string>()
    };
  }

  return {
    rawAuthorizations: {
      allow: cloneRawAllowEntries(container)
    },
    rawSource:
      options.mode === 'builder'
        ? await materializeAuthorizationIntentSourceValue(options.rawSource, options.env)
        : options.rawSource,
    toolLevelAllowTools: new Set<string>()
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

function extractRawAuthorizationArgs(entry: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(entry)) {
    return undefined;
  }

  if (isPlainObject(entry.args)) {
    return entry.args as Record<string, unknown>;
  }

  if (!hasOwnProperty(entry, 'args') && !hasOwnProperty(entry, 'kind')) {
    return entry as Record<string, unknown>;
  }

  return undefined;
}

function hasNonNullAuthorizationValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (isStructuredValue(value)) {
    return hasNonNullAuthorizationValue(value.data);
  }

  if (Array.isArray(value)) {
    return true;
  }

  if (isPlainObject(value)) {
    if (hasOwnProperty(value, 'eq')) {
      return hasNonNullAuthorizationValue((value as Record<string, unknown>).eq);
    }
    if (hasOwnProperty(value, 'oneOf')) {
      const candidates = (value as Record<string, unknown>).oneOf;
      return Array.isArray(candidates)
        ? candidates.some(candidate => hasNonNullAuthorizationValue(candidate))
        : candidates !== null && candidates !== undefined;
    }
    if (hasOwnProperty(value, 'value') || hasOwnProperty(value, 'source')) {
      return hasOwnProperty(value, 'value')
        ? hasNonNullAuthorizationValue((value as Record<string, unknown>).value)
        : false;
    }
    return true;
  }

  return true;
}

function buildNoUpdateFieldsMessage(toolName: string, updateArgs: readonly string[]): string {
  const fieldList = updateArgs.join(', ');
  return fieldList.length > 0
    ? `Tool '${toolName}' update authorization must specify at least one update field: ${fieldList}`
    : `Tool '${toolName}' update authorization must specify at least one update field`;
}

function deleteRawAuthorizationTool(
  rawAuthorizations: unknown,
  toolName: string
): void {
  const allow = isPlainObject(rawAuthorizations) && isPlainObject(rawAuthorizations.allow)
    ? rawAuthorizations.allow
    : undefined;
  if (!allow) {
    return;
  }
  delete allow[toolName];
}

function validateRawAuthorizationMetadata(options: {
  rawAuthorizations: unknown;
  toolContext?: ReadonlyMap<string, AuthorizationToolContext>;
  taskText?: string;
  issues: PolicyAuthorizationCompilerIssue[];
}): void {
  const allow = isPlainObject(options.rawAuthorizations) && isPlainObject(options.rawAuthorizations.allow)
    ? options.rawAuthorizations.allow
    : undefined;
  if (!allow) {
    return;
  }

  const normalizedTaskText =
    typeof options.taskText === 'string' && options.taskText.trim().length > 0
      ? options.taskText.trim().toLowerCase()
      : undefined;

  for (const [toolName, entry] of Object.entries({ ...allow })) {
    const tool = options.toolContext?.get(toolName);
    if (!tool) {
      continue;
    }

    const rawArgs = extractRawAuthorizationArgs(entry);
    if (tool.hasUpdateArgsMetadata) {
      const updateArgs = [...tool.updateArgs];
      const hasUpdateValue =
        rawArgs !== undefined
          && updateArgs.some(argName =>
            hasOwnProperty(rawArgs, argName) && hasNonNullAuthorizationValue(rawArgs[argName])
          );
      if (!hasUpdateValue) {
        pushCompilerIssue(options.issues, {
          reason: 'no_update_fields',
          message: buildNoUpdateFieldsMessage(toolName, updateArgs),
          tool: toolName
        });
        delete allow[toolName];
        continue;
      }
    }

    if (!normalizedTaskText || !rawArgs || !(tool.exactPayloadArgs && tool.exactPayloadArgs.size > 0)) {
      continue;
    }

    let payloadValid = true;
    for (const argName of tool.exactPayloadArgs) {
      if (!hasOwnProperty(rawArgs, argName)) {
        continue;
      }

      payloadValid =
        validateExactPayloadValueAgainstTask({
          toolName,
          argName,
          value: rawArgs[argName],
          normalizedTaskText,
          issues: options.issues
        })
        && payloadValid;
    }

    if (!payloadValid) {
      delete allow[toolName];
    }
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

function isAstLikePolicySourceValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (isStructuredValue(value) || isVariable(value)) {
    return false;
  }
  if (isAstObjectNode(value) || isAstArrayNode(value)) {
    return true;
  }

  const candidate = value as {
    wrapperType?: unknown;
    content?: unknown;
    type?: unknown;
    nodeId?: unknown;
    location?: unknown;
  };
  if (candidate.wrapperType !== undefined && Array.isArray(candidate.content)) {
    return true;
  }

  return (
    typeof candidate.type === 'string'
    && (
      Object.prototype.hasOwnProperty.call(candidate, 'nodeId')
      || Object.prototype.hasOwnProperty.call(candidate, 'location')
    )
  );
}

function getAstObjectEntryValue(node: unknown, key: string): unknown {
  if (!isAstObjectNode(node)) {
    return undefined;
  }
  return node.entries?.find(entry => getStaticObjectKey(entry?.key) === key)?.value;
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
    const result: { [key: string]: unknown } = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await unwrapResolvedConstraintValue(entry, env);
    }
    return result;
  }
  return value;
}

export async function materializePolicySourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(value) && extractSecurityDescriptor(value)) {
    return value;
  }
  if (isVariable(value)) {
    return materializePolicySourceValue(await extractVariableValue(value, env), env);
  }
  if (isAstArrayNode(value)) {
    const items: unknown[] = [];
    for (const item of value.items ?? []) {
      items.push(await materializePolicySourceValue(item, env));
    }
    return items;
  }
  if (isAstObjectNode(value)) {
    const result: { [key: string]: unknown } = {};
    for (const entry of value.entries ?? []) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      if (
        (entry as { type?: unknown }).type === 'pair'
      ) {
        const key = await materializePolicySourceValue((entry as { key?: unknown }).key, env);
        result[String(key ?? '')] = await materializePolicySourceValue(
          (entry as { value?: unknown }).value,
          env
        );
        continue;
      }
      if (
        (entry as { type?: unknown }).type === 'spread'
        && Array.isArray((entry as { value?: unknown[] }).value)
      ) {
        for (const spreadNode of (entry as { value: unknown[] }).value) {
          const spreadValue = await materializePolicySourceValue(spreadNode, env);
          if (isPlainObject(spreadValue)) {
            Object.assign(result, spreadValue);
          }
        }
      }
    }
    return result;
  }
  if (isAstLikePolicySourceValue(value)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as MlldNode | MlldNode[], env, { isExpression: true });
    return materializePolicySourceValue(result.value, env);
  }
  if (
    isStructuredValue(value)
    && value.type !== 'object'
    && value.type !== 'array'
    && extractSecurityDescriptor(value)
  ) {
    return value;
  }
  if (isStructuredValue(value)) {
    return materializePolicySourceValue(value.data, env);
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      items.push(await materializePolicySourceValue(item, env));
    }
    return items;
  }
  if (isPlainObject(value)) {
    const result: { [key: string]: unknown } = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await materializePolicySourceValue(entry, env);
    }
    return result;
  }
  return boundary.config(value, env);
}

async function resolveConstraintSourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (value && typeof value === 'object') {
    const candidate = value as { type?: unknown };
    if (candidate.type === 'VariableReference') {
      const reference = value as VariableReferenceNode;
      const variable = env.getVariable(reference.identifier);
      if (!variable) {
        return (
          await repairSecurityRelevantValue({
            value: reference,
            env,
            matchScope: 'session',
            includeSessionProofMatches: true,
            dropAmbiguousArrayElements: isArrayLikeConstraintValue(reference),
            collapseEquivalentProjectedMatches: true
          })
        ).value;
      }
      const hasFieldAccess =
        Array.isArray(reference.fields)
        && reference.fields.length > 0;
      const hasPipes =
        Array.isArray(reference.pipes)
        && reference.pipes.length > 0;
      const resolved =
        hasFieldAccess || hasPipes
          ? (
              await (await import('@interpreter/core/interpreter')).evaluate(
                value as MlldNode | MlldNode[],
                env,
                { isExpression: true }
              )
            ).value
          : await resolveValueHandles(variable, env);
      const handleResolved = await resolveValueHandles(resolved, env);
      const unwrapped = await unwrapResolvedConstraintValue(handleResolved, env);
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
      const result: { [key: string]: unknown } = {};
      for (const entry of value.entries ?? []) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        if ((entry as { type?: unknown }).type !== 'pair') {
          continue;
        }
        const key = await resolveConstraintSourceValue((entry as { key?: unknown }).key, env);
        result[String(key ?? '')] = await resolveConstraintSourceValue(
          (entry as { value?: unknown }).value,
          env
        );
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
    'type' in (value as { type?: unknown }) &&
    !isStructuredValue(value)
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as MlldNode | MlldNode[], env, { isExpression: true });
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

function getConstraintFactSourceKey(handle: FactSourceHandle): string {
  if (handle.instanceKey !== undefined) {
    return `${handle.sourceRef}:instance:${handle.instanceKey}`;
  }
  if (handle.coercionId && handle.position !== undefined) {
    return `${handle.sourceRef}:coercion:${handle.coercionId}:${handle.position}`;
  }
  return `${handle.ref}:unknown`;
}

function cloneConstraintFactSourceHandle(handle: FactSourceHandle): FactSourceHandle {
  return {
    ...handle,
    ...(Array.isArray(handle.tiers) ? { tiers: Object.freeze([...handle.tiers]) } : {})
  };
}

function dedupeConstraintFactsources(
  factsources: readonly FactSourceHandle[]
): FactSourceHandle[] {
  const unique = new Map<string, FactSourceHandle>();
  for (const handle of factsources) {
    if (!isFactSourceHandle(handle)) {
      continue;
    }
    unique.set(getConstraintFactSourceKey(handle), cloneConstraintFactSourceHandle(handle));
  }
  return Array.from(unique.values());
}

function collectConstraintFactsources(
  value: unknown,
  seen = new Set<unknown>()
): FactSourceHandle[] {
  const collected: FactSourceHandle[] = [];

  const pushFactsources = (candidate: unknown): void => {
    if (!Array.isArray(candidate)) {
      return;
    }
    for (const handle of candidate) {
      if (isFactSourceHandle(handle)) {
        collected.push(handle);
      }
    }
  };

  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);

    if (isVariable(candidate)) {
      pushFactsources(candidate.mx?.factsources);
    }

    if (isStructuredValue(candidate)) {
      pushFactsources(candidate.metadata?.factsources);
      pushFactsources(candidate.mx?.factsources);
      visit(candidate.data);
      return;
    }

    const recordCandidate = candidate as {
      mx?: { factsources?: readonly unknown[] };
      metadata?: { factsources?: readonly unknown[] };
    };
    pushFactsources(recordCandidate.mx?.factsources);
    pushFactsources(recordCandidate.metadata?.factsources);

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    if (isPlainObject(candidate)) {
      for (const entry of Object.values(candidate)) {
        visit(entry);
      }
    }
  };

  visit(value);
  return dedupeConstraintFactsources(collected);
}

async function extractConstraintFactsources(
  value: unknown,
  env: Environment
): Promise<FactSourceHandle[]> {
  const resolvedValue = await resolveConstraintSourceValue(value, env);
  return collectConstraintFactsources(resolvedValue);
}

async function extractConstraintFactsourcesSafe(
  value: unknown,
  env: Environment
): Promise<FactSourceHandle[]> {
  try {
    return await extractConstraintFactsources(value, env);
  } catch (error) {
    if (isAmbiguousProjectedValueError(error)) {
      return [];
    }
    throw error;
  }
}

function collectFactBackedCanonicalMatches(options: {
  value: unknown;
  targetKey: string;
  matches: Map<string, unknown>;
  seen?: Set<unknown>;
}): void {
  const seen = options.seen ?? new Set<unknown>();
  const candidate = options.value;
  if (candidate === null || candidate === undefined) {
    return;
  }

  if (typeof candidate === 'object') {
    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
  }

  if (entryHasFactProof(candidate) && encodeCanonicalValue(candidate) === options.targetKey) {
    const labels = collectValueProofLabels(candidate).sort().join('|');
    const factsourceKey = collectConstraintFactsources(candidate)
      .map(getConstraintFactSourceKey)
      .sort()
      .join('|');
    options.matches.set(`${labels}::${factsourceKey}`, candidate);
  }

  if (isVariable(candidate)) {
    collectFactBackedCanonicalMatches({
      ...options,
      value: candidate.value,
      seen
    });
    return;
  }

  if (isStructuredValue(candidate)) {
    collectFactBackedCanonicalMatches({
      ...options,
      value: candidate.data,
      seen
    });
    return;
  }

  if (Array.isArray(candidate)) {
    for (const entry of candidate) {
      collectFactBackedCanonicalMatches({
        ...options,
        value: entry,
        seen
      });
    }
    return;
  }

  if (isPlainObject(candidate)) {
    for (const entry of Object.values(candidate)) {
      collectFactBackedCanonicalMatches({
        ...options,
        value: entry,
        seen
      });
    }
  }
}

async function findUniqueFactBackedValueMatch(
  env: Environment,
  value: unknown
): Promise<unknown | undefined> {
  const targetKey = encodeCanonicalValue(value);
  if (!targetKey) {
    return undefined;
  }

  const matches = new Map<string, unknown>();
  for (const entry of env.findIssuedHandlesByCanonicalValue(value)) {
    if (!entryHasFactProof(entry.value)) {
      continue;
    }
    const labels = collectValueProofLabels(entry.value).sort().join('|');
    const factsourceKey = collectConstraintFactsources(entry.value)
      .map(getConstraintFactSourceKey)
      .sort()
      .join('|');
    matches.set(`${labels}::${factsourceKey}`, entry.value);
  }
  if (matches.size > 1) {
    return undefined;
  }

  for (const [, variable] of env.getAllVariables()) {
    let resolved: unknown;
    try {
      resolved = await extractVariableValue(variable, env);
    } catch {
      continue;
    }
    collectFactBackedCanonicalMatches({
      value: resolved,
      targetKey,
      matches
    });
    if (matches.size > 1) {
      return undefined;
    }
  }

  return matches.size === 1 ? [...matches.values()][0] : undefined;
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
            let compiledFactsources =
              Array.isArray(rawEqValue)
                ? dedupeConstraintFactsources(
                    (
                      await Promise.all(
                        rawEqValue.map(candidate => extractConstraintFactsourcesSafe(candidate, env))
                      )
                    ).flat()
                  )
                : await extractConstraintFactsourcesSafe(rawEqValue, env);
            if (compiledFactsources.length === 0) {
              compiledFactsources =
                Array.isArray(clause.eq)
                  ? dedupeConstraintFactsources(
                      (
                        await Promise.all(
                          clause.eq.map(candidate => extractConstraintFactsourcesSafe(candidate, env))
                        )
                      ).flat()
                    )
                  : await extractConstraintFactsourcesSafe(clause.eq, env);
            }
            const nextClause =
              compiledAttestations.length > 0
                ? {
                    ...clause,
                    attestations: compiledAttestations
                  }
                : clause;
            if (compiledAttestations.length > 0) {
              report.compiledProofs.push({
                tool: toolName,
                arg: argName,
                labels: [...compiledAttestations]
              });
            }
            if (compiledFactsources.length > 0) {
              setAuthorizationConstraintClauseEqFactsources(nextClause, compiledFactsources);
            }
            return nextClause;
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
            let fallbackOneOfFactsources = await Promise.all(
              rawOneOfCandidates.map(candidate => extractConstraintFactsourcesSafe(candidate, env))
            );
            if (!fallbackOneOfFactsources.some(entry => entry.length > 0)) {
              fallbackOneOfFactsources = await Promise.all(
                clause.oneOf.map(candidate => extractConstraintFactsourcesSafe(candidate, env))
              );
            }
            if (fallbackOneOfFactsources.some(entry => entry.length > 0)) {
              setAuthorizationConstraintClauseOneOfFactsources(clause, fallbackOneOfFactsources);
            }
            return clause;
          }
          let oneOfFactsources = await Promise.all(
            rawOneOfCandidates.map(candidate => extractConstraintFactsourcesSafe(candidate, env))
          );
          if (!oneOfFactsources.some(entry => entry.length > 0)) {
            oneOfFactsources = await Promise.all(
              clause.oneOf.map(candidate => extractConstraintFactsourcesSafe(candidate, env))
            );
          }
          report.compiledProofs.push({
            tool: toolName,
            arg: argName,
            labels: Array.from(new Set(oneOfAttestations.flatMap(entry => entry)))
          });
          const nextClause = {
            ...clause,
            oneOfAttestations
          };
          if (oneOfFactsources.some(entry => entry.length > 0)) {
            setAuthorizationConstraintClauseOneOfFactsources(nextClause, oneOfFactsources);
          }
          return nextClause;
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

  const repairedDirectLabels = collectDirectValueProofLabels(repairedEq);
  if (hasAcceptedProofLabels(repairedDirectLabels)) {
    return {
      ...options.clause,
      eq: repairedEq,
      ...(!Array.isArray(options.clause.attestations) || options.clause.attestations.length === 0
        ? { attestations: repairedDirectLabels }
        : {})
    };
  }
  const repairedValueLabels =
    !Array.isArray(repairedEq)
      ? collectValueProofLabels(repairedEq)
      : [];
  if (!Array.isArray(repairedEq) && hasAcceptedProofLabels(repairedValueLabels)) {
    return {
      ...options.clause,
      eq: repairedEq,
      ...(!Array.isArray(options.clause.attestations) || options.clause.attestations.length === 0
        ? { attestations: repairedValueLabels }
        : {})
    };
  }

  const directLabels = collectDirectValueProofLabels(options.clause.eq);
  if (hasAcceptedProofLabels(directLabels)) {
    return {
      ...options.clause,
      ...(!Array.isArray(options.clause.attestations) || options.clause.attestations.length === 0
        ? { attestations: directLabels }
        : {})
    };
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

      const liftedMatch =
        options.mode === 'builder'
          ? await findUniqueFactBackedValueMatch(options.env, element)
          : undefined;
      if (
        liftedMatch !== undefined
        && hasAcceptedProofLabels(collectValueProofLabels(liftedMatch))
      ) {
        retained.push(liftedMatch);
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

  const liftedMatch =
    options.mode === 'builder'
      ? await findUniqueFactBackedValueMatch(options.env, repairedEq)
      : undefined;
  if (liftedMatch !== undefined) {
    const liftedLabels = collectValueProofLabels(liftedMatch);
    if (hasAcceptedProofLabels(liftedLabels)) {
      return {
        ...options.clause,
        eq: liftedMatch,
        attestations: liftedLabels
      };
    }
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
    mode: options.mode,
    toolContext: options.toolContext,
    taskText: options.taskText,
    issues
  });
  const rawAuthorizations = normalizedIntent.rawAuthorizations;
  const toolLevelAllowTools = normalizedIntent.toolLevelAllowTools;
  if (rawAuthorizations === undefined || rawAuthorizations === null) {
    return { authorizations: undefined, issues, report };
  }

  validateRawAuthorizationMetadata({
    rawAuthorizations,
    toolContext: options.toolContext,
    taskText: options.taskText,
    issues
  });

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

  for (const toolName of toolLevelAllowTools) {
    if (normalized.allow?.[toolName]?.kind === 'unconstrained') {
      normalized.allow[toolName] = { kind: 'tool' };
    }
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
