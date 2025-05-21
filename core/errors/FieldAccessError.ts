import { MeldError, ErrorSeverity } from './MeldError';
import { ResolutionErrorCode } from './index';
import type { Field as AstField } from '@core/ast/types/common';

/**
 * Details specific to field access errors.
 */
export interface FieldAccessErrorDetails {
  /** The base object or value being accessed */
  baseValue: unknown;
  /** The sequence of field/index accesses attempted */
  fieldAccessChain: AstField[];
  /** The index in the chain where the access failed */
  failedAtIndex: number;
  /** The specific field/index key that failed */
  failedKey: string | number;
}

/**
 * Error class for issues encountered during field access (e.g., accessing a property on null/undefined, invalid index).
 */
export class FieldAccessError extends MeldError {
  public details: FieldAccessErrorDetails;

  constructor(message: string, details: FieldAccessErrorDetails, cause?: unknown) {
    super(message, {
        code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
        severity: ErrorSeverity.Recoverable,
        details: details,
        cause: cause
    });
    this.name = 'FieldAccessError';
    this.details = details;
  }
} 