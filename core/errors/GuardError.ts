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
}

export interface GuardErrorOptions {
  message: string;
  decision: 'deny' | 'retry';
  guardName?: string | null;
  guardFilter?: string;
  scope?: GuardScope;
  operation?: OperationContext;
  inputPreview?: string | null;
  retryHint?: string | null;
  sourceLocation?: SourceLocation | null;
  env?: Environment;
}

export class GuardError extends MlldError {
  public readonly decision: 'deny' | 'retry';
  public readonly retryHint?: string | null;

  constructor(options: GuardErrorOptions) {
    const details: GuardErrorDetails = {
      guardName: options.guardName ?? null,
      guardFilter: options.guardFilter,
      scope: options.scope,
      operation: options.operation,
      inputPreview: options.inputPreview ?? null,
      decision: options.decision,
      retryHint: options.retryHint ?? null
    };

    super(options.message, {
      code: 'GUARD_ERROR',
      severity: ErrorSeverity.Fatal,
      details,
      sourceLocation: options.sourceLocation ?? undefined,
      env: options.env
    });

    this.decision = options.decision;
    this.retryHint = options.retryHint ?? null;
  }
}
