import { GuardError, type GuardErrorOptions } from './GuardError';

export type GuardResumeSignalOptions = Omit<GuardErrorOptions, 'decision'>;

export class GuardResumeSignal extends GuardError {
  constructor(options: GuardResumeSignalOptions) {
    super({ ...options, decision: 'resume' });
    this.name = 'GuardResumeSignal';
  }
}

export function isGuardResumeSignal(error: unknown): error is GuardResumeSignal {
  return error instanceof GuardResumeSignal;
}
