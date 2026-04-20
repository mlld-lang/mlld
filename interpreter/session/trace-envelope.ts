import type { SessionDefinition, SessionWriteOperation } from '@core/types/session';
import type { Environment } from '@interpreter/env/Environment';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
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

function collectSensitiveLabels(value: unknown, env: Environment): string[] {
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  const effectiveDescriptor = new PolicyEnforcer(env.getPolicySummary()).applyDefaultTrustLabel(descriptor);
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

function describeValueSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value ?? '').length;
  }
}

function shouldCapValueAtEffects(value: unknown): boolean {
  return describeValueSize(value) > SESSION_TRACE_EFFECTS_SIZE_CAP;
}

function formatSizedValue(value: unknown, labels: readonly string[] = []): string {
  const prefix = labels.length > 0 ? `labels=[${labels.join(',')}] ` : '';
  return `<${prefix}size=${describeValueSize(value)}>`;
}

function formatRedactedValue(value: unknown, labels: readonly string[]): string {
  if (labels.length === 0) {
    return formatSizedValue(value);
  }
  return formatSizedValue(value, labels);
}

function redactForObserver(value: unknown, env: Environment, verbose: boolean): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (verbose) {
    return value;
  }
  const sensitiveLabels = collectSensitiveLabels(value, env);
  if (sensitiveLabels.length === 0) {
    if (shouldCapValueAtEffects(value)) {
      return formatSizedValue(value);
    }
    return value;
  }
  return formatRedactedValue(value, sensitiveLabels);
}

export function buildSessionSeedTraceEnvelope(args: {
  env: Environment;
  frameId: string;
  definition: SessionDefinition;
  path: string;
  nextValue: unknown;
}): RuntimeTraceEnvelope<'session.seed'> {
  const verbose = args.env.getRuntimeTraceLevel() === 'verbose';
  return traceSessionSeed({
    frameId: args.frameId,
    sessionName: args.definition.canonicalName,
    declarationId: args.definition.id,
    originPath: args.definition.originPath,
    path: args.path,
    operation: 'seed',
    ...(args.nextValue !== undefined ? { value: redactForObserver(args.nextValue, args.env, verbose) } : {})
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
  const verbose = args.env.getRuntimeTraceLevel() === 'verbose';
  return traceSessionWrite({
    frameId: args.frameId,
    sessionName: args.definition.canonicalName,
    declarationId: args.definition.id,
    originPath: args.definition.originPath,
    path: args.path,
    operation: args.operation,
    ...(args.previousValue !== undefined ? { previous: redactForObserver(args.previousValue, args.env, verbose) } : {}),
    ...(args.nextValue !== undefined ? { value: redactForObserver(args.nextValue, args.env, verbose) } : {})
  });
}

export function buildSessionFinalTraceEnvelope(args: {
  env: Environment;
  frameId: string;
  definition: SessionDefinition;
  finalState: Record<string, unknown>;
}): RuntimeTraceEnvelope<'session.final'> {
  const verbose = args.env.getRuntimeTraceLevel() === 'verbose';
  const finalState = verbose
    ? args.finalState
    : Object.fromEntries(
        Object.entries(args.finalState).map(([key, value]) => [key, redactForObserver(value, args.env, false)])
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
