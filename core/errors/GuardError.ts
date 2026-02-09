import type { SourceLocation } from '@core/types';
import type { OperationContext, GuardContextSnapshot } from '@interpreter/env/ContextManager';
import type { GuardScope } from '@core/types/guard';
import type { Environment } from '@interpreter/env/Environment';
import type { GuardHint, GuardResult } from '@core/types/guard';
import { ErrorSeverity, type BaseErrorDetails } from './MlldError';
import { MlldDenialError, type DenialContext } from './denial';

export interface GuardErrorDetails extends BaseErrorDetails {
  guardName?: string | null;
  guardFilter?: string;
  scope?: GuardScope;
  operation?: OperationContext;
  inputPreview?: string | null;
  outputPreview?: string | null;
  timing?: 'before' | 'after';
  decision: 'deny' | 'retry';
  retryHint?: string | null;
  reason?: string | null;
  guardContext?: GuardContextSnapshot;
  guardInput?: unknown;
  reasons?: string[];
  guardResults?: GuardResult[];
  hints?: GuardHint[];
}

export interface GuardErrorOptions {
  decision: 'deny' | 'retry';
  guardName?: string | null;
  guardFilter?: string;
  scope?: GuardScope;
  operation?: OperationContext;
  inputPreview?: string | null;
  retryHint?: string | null;
  reason?: string | null;
  message?: string;
  sourceLocation?: SourceLocation | null;
  env?: Environment;
  guardContext?: GuardContextSnapshot;
  guardInput?: unknown;
  reasons?: string[];
  guardResults?: GuardResult[];
  hints?: GuardHint[];
  outputPreview?: string | null;
  timing?: 'before' | 'after';
}

export class GuardError extends MlldDenialError {
  public readonly decision: 'deny' | 'retry';
  public readonly retryHint?: string | null;
  public readonly reason?: string | null;

  constructor(options: GuardErrorOptions) {
    const resolvedReason = options.reason ?? defaultReasonForDecision(options.decision);
    const displayName = normalizeGuardDisplayName(options.guardName);
    const resolvedMessage = options.message ?? formatGuardMessage({
      ...options,
      guardName: displayName,
      reason: resolvedReason
    });
    const denialContext = buildGuardDenialContext({ ...options, guardName: displayName }, resolvedReason);

    const details: GuardErrorDetails = {
      guardName: displayName,
      guardFilter: options.guardFilter,
      scope: options.scope,
      operation: options.operation,
      inputPreview: options.inputPreview ?? null,
      outputPreview: options.outputPreview ?? null,
      timing: options.timing,
      decision: options.decision,
      retryHint: options.retryHint ?? null,
      reason: resolvedReason,
      guardContext: options.guardContext,
      guardInput: options.guardInput,
      reasons: options.reasons,
      guardResults: options.guardResults,
      hints: options.hints
    };

    super(denialContext, {
      message: resolvedMessage,
      severity: ErrorSeverity.Fatal,
      details,
      sourceLocation: options.sourceLocation ?? undefined,
      env: options.env
    });

    this.decision = options.decision;
    this.retryHint = options.retryHint ?? null;
    this.reason = resolvedReason ?? null;
  }
}

function normalizeGuardDisplayName(name?: string | null): string | null {
  if (!name) return null;
  return name.startsWith('@') ? name : `@${name}`;
}

function defaultReasonForDecision(decision: 'deny' | 'retry'): string {
  return decision === 'retry' ? 'Guard requested retry' : 'Guard denied operation';
}

function formatGuardMessage(options: GuardErrorOptions & { reason?: string | null }): string {
  const guardLabel = formatGuardLabel(options.guardName, options.guardFilter);
  const operationLabel = formatOperationLabel(options.operation);
  const lines: string[] = [];
  const reason = options.reason ?? defaultReasonForDecision(options.decision);
  const hint = options.retryHint ?? null;

  if (options.decision === 'retry') {
    lines.push(`Guard retry requested: ${hint ?? reason}`);
  } else if (hint) {
    lines.push(`Guard retry failed: ${reason}`);
  } else {
    lines.push(`Guard blocked operation: ${reason}`);
  }

  if (guardLabel) {
    lines.push(`  Guard: ${guardLabel}`);
  }
  if (operationLabel) {
    lines.push(`  Operation: ${operationLabel}`);
  }
  if (options.decision === 'retry' && hint) {
    lines.push(`  Hint: ${hint}`);
  } else if (options.decision === 'deny' && hint) {
    lines.push(`  Hint: ${hint}`);
  }

  return lines.join('\n');
}

function formatGuardLabel(guardName?: string | null, guardFilter?: string): string {
  if (guardName && guardFilter) {
    return `${guardName} (for ${guardFilter})`;
  }
  if (guardName) {
    return guardName;
  }
  if (guardFilter) {
    return guardFilter;
  }
  return 'guard';
}

function formatOperationLabel(operation?: OperationContext): string | null {
  if (!operation || !operation.type) {
    return null;
  }
  const base = operation.type.startsWith('/') ? operation.type : `/${operation.type}`;
  const subtype = operation.subtype ? ` (${operation.subtype})` : '';
  return `${base}${subtype}`;
}

function buildGuardDenialContext(options: GuardErrorOptions, reason: string): DenialContext {
  const operationType = options.operation?.type ?? 'operation';
  const description =
    options.operation?.command ??
    options.operation?.target ??
    options.operation?.name ??
    '';
  const labels = {
    input: Array.isArray(options.operation?.labels)
      ? options.operation!.labels.map(label => String(label))
      : [],
    operation: Array.isArray(options.operation?.opLabels)
      ? options.operation!.opLabels.map(label => String(label))
      : []
  };
  const hasLabels = labels.input.length > 0 || labels.operation.length > 0;

  return {
    code: 'GUARD_DENIED',
    operation: {
      type: operationType,
      description: description
    },
    blocker: {
      type: 'guard',
      name: formatGuardLabel(options.guardName ?? null, options.guardFilter)
    },
    ...(hasLabels ? { labels } : {}),
    reason
  };
}
