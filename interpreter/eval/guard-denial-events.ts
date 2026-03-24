import { GuardError, type GuardErrorDetails } from '@core/errors/GuardError';
import { MlldDenialError } from '@core/errors/denial';
import type { DenialContext } from '@core/errors/denial';
import type { GuardContextSnapshot, OperationContext } from '@interpreter/env/ContextManager';
import type { GuardArgsSnapshot } from '@interpreter/utils/guard-args';
import { resolveNestedValue } from '@interpreter/utils/display-materialization';
import type { SDKGuardDenial } from '@sdk/types';

function stripPrefix(value?: string | null, prefix = '@'): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
}

function normalizeRule(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveOperationName(
  operation?: OperationContext,
  denialContext?: DenialContext
): string {
  const name =
    stripPrefix(operation?.name) ??
    stripPrefix(denialContext?.operation.description) ??
    stripPrefix(operation?.target) ??
    stripPrefix(operation?.command) ??
    stripPrefix(operation?.type, '/') ??
    stripPrefix(denialContext?.operation.type, '/');
  return name ?? 'operation';
}

function collectLabels(
  denialContext?: DenialContext,
  guardContext?: GuardContextSnapshot
): string[] {
  const labels = [
    ...(denialContext?.labels?.input ?? []),
    ...(denialContext?.labels?.operation ?? []),
    ...(guardContext?.labels ?? []),
    ...(guardContext?.taint ?? [])
  ];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const label of labels) {
    if (typeof label !== 'string') {
      continue;
    }
    const trimmed = label.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function toSerializableArgValue(value: unknown): unknown {
  const resolved = resolveNestedValue(value);
  return resolved === undefined ? null : resolved;
}

function extractArgs(snapshot?: GuardArgsSnapshot): Record<string, unknown> | null {
  if (!snapshot || snapshot.names.length === 0) {
    return null;
  }

  const args: Record<string, unknown> = {};
  for (const name of snapshot.names) {
    const variable = snapshot.values[name];
    if (!variable) {
      continue;
    }
    args[name] = toSerializableArgValue(variable);
  }

  return Object.keys(args).length > 0 ? args : null;
}

function buildGuardDenial(
  reason: string,
  denialContext?: DenialContext,
  guardContext?: GuardContextSnapshot,
  details?: GuardErrorDetails
): SDKGuardDenial {
  const isPolicyDenial = denialContext?.blocker.type === 'policy';
  return {
    guard: isPolicyDenial ? null : stripPrefix(details?.guardName ?? null),
    operation: deriveOperationName(details?.operation, denialContext),
    reason,
    rule: isPolicyDenial ? normalizeRule(denialContext?.blocker.rule) : null,
    labels: collectLabels(denialContext, guardContext),
    args: extractArgs(guardContext?.args)
  };
}

export function extractGuardDenial(error: unknown): SDKGuardDenial | null {
  if (error instanceof GuardError && error.decision === 'deny') {
    const details = (error.details ?? {}) as GuardErrorDetails;
    const reason =
      error.reason ??
      details.reason ??
      error.context.reason ??
      error.message ??
      'Guard denied operation';
    return buildGuardDenial(reason, error.context, details.guardContext, details);
  }

  if (
    error instanceof MlldDenialError &&
    error.context.code === 'POLICY_LABEL_FLOW_DENIED'
  ) {
    return buildGuardDenial(
      error.context.reason ?? error.message ?? 'Policy denied operation',
      error.context
    );
  }

  return null;
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(entry => stableNormalize(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableNormalize(entry)])
    );
  }
  return value;
}

export function guardDenialKey(denial: SDKGuardDenial): string {
  return JSON.stringify(
    stableNormalize({
      ...denial,
      labels: [...denial.labels].sort()
    })
  );
}
