import { GuardError, type GuardErrorOptions } from './GuardError';

export type GuardRetrySignalOptions = Omit<GuardErrorOptions, 'decision'>;

export class GuardRetrySignal extends GuardError {
  constructor(options: GuardRetrySignalOptions) {
    super({ ...options, decision: 'retry' });
    this.name = 'GuardRetrySignal';
  }
}

export function isGuardRetrySignal(error: unknown): error is GuardRetrySignal {
  return error instanceof GuardRetrySignal;
}
