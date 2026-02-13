import type { SourceLocation } from '@core/types';
import { ErrorSeverity, MlldError } from './MlldError';

export const BAIL_EXIT_CODE = 1;
const DEFAULT_BAIL_MESSAGE = 'Script terminated by bail directive.';

export class MlldBailError extends MlldError {
  public readonly exitCode: number;

  constructor(message?: string, sourceLocation?: SourceLocation) {
    const resolvedMessage = typeof message === 'string' && message.trim().length > 0
      ? message
      : DEFAULT_BAIL_MESSAGE;

    super(resolvedMessage, {
      code: 'BAIL_EXIT',
      severity: ErrorSeverity.Fatal,
      sourceLocation,
      details: { exitCode: BAIL_EXIT_CODE }
    });

    this.exitCode = BAIL_EXIT_CODE;
  }
}

export function isBailError(error: unknown): error is MlldBailError {
  if (!(error instanceof MlldError)) {
    return false;
  }
  return error.code === 'BAIL_EXIT';
}

