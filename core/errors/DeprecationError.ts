import { MlldError, ErrorSeverity, type BaseErrorDetails } from './MlldError';

/**
 * Represents a deprecation notice. Non-fatal, Warning severity by default.
 */
export class DeprecationError extends MlldError {
  constructor(message: string, details?: BaseErrorDetails) {
    super(message, {
      code: 'DEPRECATION',
      severity: ErrorSeverity.Warning,
      details
    });
  }
}

