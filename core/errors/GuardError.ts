import type { SourceLocation } from '@core/types';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { GuardScope } from '@core/types/guard';
import type { Environment } from '@interpreter/env/Environment';
import { MlldError, ErrorSeverity, type BaseErrorDetails } from './MlldError';

export interface GuardErrorDetails extends BaseErrorDetails {
  guardName?: string | null;
  guardFilter?: string;
  scope?: GuardScope;
  operation?: OperationContext;
  inputPreview?: string | null;
  decision: 'deny' | 'retry';
  retryHint?: string | null;
  reason?: string | null;
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
}

export class GuardError extends MlldError {
  public readonly decision: 'deny' | 'retry';
  public readonly retryHint?: string | null;
  public readonly reason?: string | null;

  constructor(options: GuardErrorOptions) {
    const resolvedReason = options.reason ?? defaultReasonForDecision(options.decision);
    const resolvedMessage = options.message ?? formatGuardMessage({
      ...options,
      reason: resolvedReason
    });

    const details: GuardErrorDetails = {
      guardName: options.guardName ?? null,
      guardFilter: options.guardFilter,
      scope: options.scope,
      operation: options.operation,
      inputPreview: options.inputPreview ?? null,
      decision: options.decision,
      retryHint: options.retryHint ?? null,
      reason: resolvedReason
    };

    super(resolvedMessage, {
      code: 'GUARD_ERROR',
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
