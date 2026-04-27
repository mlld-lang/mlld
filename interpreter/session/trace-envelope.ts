import type { SessionDefinition, SessionWriteOperation } from '@core/types/session';
import type { Environment } from '@interpreter/env/Environment';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import {
  traceSessionFinal,
  traceSessionSeed,
  traceSessionWrite,
  type RuntimeTraceEnvelope
} from '@interpreter/tracing/events';

const REDACTED_SESSION_LABELS = new Set([
  'secret',
  'pii',
  'sensitive',
  'untrusted',
  'influenced'
]);
const SESSION_TRACE_EFFECTS_SIZE_CAP = 1024;

function sensitiveLabelsFromDescriptor(value: unknown, env: Environment): string[] {
  const effectiveDescriptor = new PolicyEnforcer(env.getPolicySummary()).applyDefaultTrustLabel(value);
  if (!effectiveDescriptor) {
    return [];
  }

  const labels = new Set<string>();
  for (const entry of effectiveDescriptor.labels) {
    if (REDACTED_SESSION_LABELS.has(entry)) {
      labels.add(entry);
    }
  }
  for (const entry of effectiveDescriptor.taint) {
    if (REDACTED_SESSION_LABELS.has(entry)) {
      labels.add(entry);
    }
  }
  return Array.from(labels).sort();
}

function collectSensitiveLabels(value: unknown, env: Environment): string[] {
  const directLabels = sensitiveLabelsFromDescriptor(
    extractSecurityDescriptor(value),
    env
  );
  if (directLabels.length > 0) {
    return directLabels;
  }

  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  return sensitiveLabelsFromDescriptor(descriptor, env);
}

function jsonStringSize(value: string): number {
  let size = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    switch (code) {
      case 0x08:
      case 0x09:
      case 0x0a:
      case 0x0c:
      case 0x0d:
      case 0x22:
      case 0x5c:
        size += 2;
        break;
      default:
        size += code < 0x20 ? 6 : 1;
        break;
    }
  }
  return size;
}

function shouldOmitObjectJsonValue(value: unknown): boolean {
  return value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol';
}

function estimateJsonSize(value: unknown, stack: WeakSet<object>, inArray = false): number | undefined {
  if (value === null) {
    return 4;
  }
  if (value === undefined) {
    return inArray ? 4 : undefined;
  }

  switch (typeof value) {
    case 'string':
      return jsonStringSize(value);
    case 'number':
      return Number.isFinite(value) ? String(value).length : 4;
    case 'boolean':
      return value ? 4 : 5;
    case 'bigint':
    case 'function':
    case 'symbol':
      return inArray ? 4 : undefined;
    case 'object':
      break;
    default:
      return String(value).length;
  }

  const objectValue = value as Record<string, unknown>;
  if (stack.has(objectValue)) {
    return undefined;
  }
  stack.add(objectValue);

  try {
    if (isStructuredValue(value)) {
      return estimateJsonSize(value.data, stack, inArray);
    }

    if (Array.isArray(value)) {
      let size = 2;
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) {
          size += 1;
        }
        size += estimateJsonSize(value[index], stack, true) ?? 4;
      }
      return size;
    }

    let size = 2;
    let first = true;
    for (const key of Object.keys(objectValue)) {
      const entry = objectValue[key];
      if (shouldOmitObjectJsonValue(entry)) {
        continue;
      }
      const entrySize = estimateJsonSize(entry, stack);
      if (entrySize === undefined) {
        return undefined;
      }
      if (!first) {
        size += 1;
      }
      first = false;
      size += jsonStringSize(key) + 1 + entrySize;
    }
    return size;
  } finally {
    stack.delete(objectValue);
  }
}

function describeValueSize(value: unknown): number {
  try {
    const estimated = estimateJsonSize(value, new WeakSet());
    if (estimated !== undefined) {
      return estimated;
    }
  } catch {
    // Fall through to the scalar fallback below.
  }
  return String(value ?? '').length;
}

function formatSizedValueWithSize(size: number, labels: readonly string[] = []): string {
  const prefix = labels.length > 0 ? `labels=[${labels.join(',')}] ` : '';
  return `<${prefix}size=${size}>`;
}

function redactForObserver(value: unknown, env: Environment, verbose: boolean): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (verbose) {
    return value;
  }
  const sensitiveLabels = collectSensitiveLabels(value, env);
  const size = describeValueSize(value);
  if (sensitiveLabels.length === 0) {
    if (size > SESSION_TRACE_EFFECTS_SIZE_CAP) {
      return formatSizedValueWithSize(size);
    }
    return value;
  }
  return formatSizedValueWithSize(size, sensitiveLabels);
}

function sessionTraceValue(value: unknown, env: Environment): unknown {
  return redactForObserver(value, env, false);
}

export function buildSessionSeedTraceEnvelope(args: {
  env: Environment;
  frameId: string;
  definition: SessionDefinition;
  path: string;
  nextValue: unknown;
}): RuntimeTraceEnvelope<'session.seed'> {
  return traceSessionSeed({
    frameId: args.frameId,
    sessionName: args.definition.canonicalName,
    declarationId: args.definition.id,
    originPath: args.definition.originPath,
    path: args.path,
    operation: 'seed',
    ...(args.nextValue !== undefined ? { value: sessionTraceValue(args.nextValue, args.env) } : {})
  });
}

export function buildSessionWriteTraceEnvelope(args: {
  env: Environment;
  frameId: string;
  definition: SessionDefinition;
  path: string;
  operation: SessionWriteOperation;
  previousValue: unknown;
  nextValue: unknown;
}): RuntimeTraceEnvelope<'session.write'> {
  return traceSessionWrite({
    frameId: args.frameId,
    sessionName: args.definition.canonicalName,
    declarationId: args.definition.id,
    originPath: args.definition.originPath,
    path: args.path,
    operation: args.operation,
    ...(args.previousValue !== undefined ? { previous: sessionTraceValue(args.previousValue, args.env) } : {}),
    ...(args.nextValue !== undefined ? { value: sessionTraceValue(args.nextValue, args.env) } : {})
  });
}

export function buildSessionFinalTraceEnvelope(args: {
  env: Environment;
  frameId: string;
  definition: SessionDefinition;
  finalState: Record<string, unknown>;
}): RuntimeTraceEnvelope<'session.final'> {
  const finalState = Object.fromEntries(
    Object.entries(args.finalState).map(([key, value]) => [key, sessionTraceValue(value, args.env)])
  );

  return traceSessionFinal({
    frameId: args.frameId,
    sessionName: args.definition.canonicalName,
    declarationId: args.definition.id,
    originPath: args.definition.originPath,
    finalState
  });
}

export function buildSessionWriteSdkPayload(args: {
  env: Environment;
  definition: SessionDefinition;
  frameId: string;
  path: string;
  operation: SessionWriteOperation;
  previousValue: unknown;
  nextValue: unknown;
}) {
  return {
    frame_id: args.frameId,
    session_name: args.definition.canonicalName,
    declaration_id: args.definition.id,
    ...(args.definition.originPath ? { origin_path: args.definition.originPath } : {}),
    slot_path: args.path,
    operation: args.operation,
    ...(args.previousValue !== undefined ? { prev: redactForObserver(args.previousValue, args.env, false) } : {}),
    ...(args.nextValue !== undefined ? { next: redactForObserver(args.nextValue, args.env, false) } : {})
  };
}
