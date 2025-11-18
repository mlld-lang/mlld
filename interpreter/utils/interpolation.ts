import type { CondensedPipe, FieldAccessNode } from '@core/types';
import { normalizeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { isStructuredValue } from '@interpreter/utils/structured-value';

export interface InterpolationNode {
  type: string;
  content?: string;
  name?: string;
  identifier?: string;
  fields?: FieldAccessNode[];
  value?: string;
  commandRef?: any;
  withClause?: any;
  pipes?: CondensedPipe[];
}

export interface InterpolateOptions {
  collectSecurityDescriptor?: (descriptor: SecurityDescriptor) => void;
}

export function extractInterpolationDescriptor(value: unknown): SecurityDescriptor | undefined {
  if (!value) {
    return undefined;
  }
  if (isStructuredValue(value)) {
    return normalizeSecurityDescriptor(value.ctx as SecurityDescriptor | undefined);
  }
  if (typeof value === 'object') {
    const ctx = (value as { ctx?: SecurityDescriptor }).ctx;
    return normalizeSecurityDescriptor(ctx as SecurityDescriptor | undefined);
  }
  return undefined;
}
