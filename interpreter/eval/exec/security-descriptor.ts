import type { SecurityDescriptor } from '@core/types/security';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { Variable, VariableContext } from '@core/types/variable';
import type { StructuredValueContext } from '@interpreter/utils/structured-value';
import { applySecurityDescriptorToStructuredValue } from '@interpreter/utils/structured-value';
import { StructuredValue as LegacyStructuredValue } from '@core/types/structured-value';

export type SecurityCarrier = {
  mx?: VariableContext | StructuredValueContext;
};

export function getVariableSecurityDescriptor(variable?: Variable): SecurityDescriptor | undefined {
  if (!variable) {
    return undefined;
  }
  return getSecurityDescriptorFromCarrier({ mx: variable.mx });
}

export function getStructuredSecurityDescriptor(
  value?: { mx?: StructuredValueContext; metadata?: { security?: SecurityDescriptor } }
): SecurityDescriptor | undefined {
  return getSecurityDescriptorFromCarrier(value);
}

export function setStructuredSecurityDescriptor(
  value: { mx?: StructuredValueContext },
  descriptor?: SecurityDescriptor
): void {
  if (!descriptor || !value || typeof value !== 'object') {
    return;
  }
  applySecurityDescriptorToStructuredValue(value as LegacyStructuredValue, descriptor);
}

export function getSecurityDescriptorFromCarrier(
  carrier?: SecurityCarrier
): SecurityDescriptor | undefined {
  if (!carrier) {
    return undefined;
  }
  return descriptorFromVarMx(carrier.mx);
}

function descriptorFromVarMx(
  mx?: VariableContext | StructuredValueContext
): SecurityDescriptor | undefined {
  if (!mx) {
    return undefined;
  }
  if (!hasSecuritySignals(mx)) {
    return undefined;
  }
  return varMxToSecurityDescriptor(mx as VariableContext);
}

function hasSecuritySignals(mx: VariableContext | StructuredValueContext): boolean {
  const labels = Array.isArray(mx.labels) ? mx.labels : [];
  const sources = Array.isArray(mx.sources) ? mx.sources : [];
  const taint = (mx as any).taint ?? 'unknown';
  return !(labels.length === 0 && sources.length === 0 && taint === 'unknown');
}
