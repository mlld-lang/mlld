import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import { MlldSecurityError } from './MlldSecurityError';

export type PolicyEnforcementCode =
  | 'allowlist_mismatch'
  | 'blocklist_match'
  | 'no_update_fields'
  | 'proofless_control_arg'
  | 'proofless_source_arg'
  | 'correlate_mismatch';

export interface PolicyErrorDetails {
  code: PolicyEnforcementCode;
  severity: 'error';
  phase: 'build' | 'dispatch';
  direction: 'input' | 'output' | 'schema' | 'catalog' | 'framework';
  tool: string;
  field?: string;
  hint: string;
}

export interface MlldPolicyErrorOptions {
  sourceLocation?: SourceLocation;
  env?: Environment;
}

export class MlldPolicyError extends MlldSecurityError {
  public readonly phase: PolicyErrorDetails['phase'];
  public readonly direction: PolicyErrorDetails['direction'];
  public readonly tool: string;
  public readonly field?: string;
  public readonly hint: string;
  public readonly details: PolicyErrorDetails;

  constructor(
    message: string,
    details: Omit<PolicyErrorDetails, 'severity'>,
    options: MlldPolicyErrorOptions = {}
  ) {
    const normalizedDetails: PolicyErrorDetails = {
      ...details,
      severity: 'error'
    };

    super(message, {
      code: normalizedDetails.code,
      details: normalizedDetails,
      sourceLocation: options.sourceLocation,
      env: options.env
    });

    this.phase = normalizedDetails.phase;
    this.direction = normalizedDetails.direction;
    this.tool = normalizedDetails.tool;
    this.field = normalizedDetails.field;
    this.hint = normalizedDetails.hint;
    this.details = normalizedDetails;
    this.name = 'MlldPolicyError';

    Object.setPrototypeOf(this, MlldPolicyError.prototype);
  }
}
