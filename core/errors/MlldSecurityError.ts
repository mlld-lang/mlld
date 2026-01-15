import { MlldError, ErrorSeverity, type MlldErrorOptions } from './MlldError';

export class MlldSecurityError extends MlldError {
  constructor(message: string, options?: Partial<MlldErrorOptions>) {
    super(message, {
      code: options?.code ?? 'SECURITY_VIOLATION',
      severity: ErrorSeverity.Fatal,
      ...options
    });
  }
}
