import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import type { Environment } from '@interpreter/env/Environment';
import {
  applySecurityDescriptorToStructuredValue,
  ensureStructuredValue,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import { getVariableSecurityDescriptor } from './exec/security-descriptor';

function hasSecuritySignals(descriptor?: SecurityDescriptor): descriptor is SecurityDescriptor {
  if (!descriptor) {
    return false;
  }
  return (
    descriptor.labels.length > 0 ||
    descriptor.taint.length > 0 ||
    descriptor.sources.length > 0
  );
}

export function mergeOptionalSecurityDescriptors(
  env: Environment,
  ...descriptors: Array<SecurityDescriptor | undefined>
): SecurityDescriptor | undefined {
  const present = descriptors.filter(hasSecuritySignals);
  if (present.length === 0) {
    return undefined;
  }
  return env.mergeSecurityDescriptors(...present);
}

export function attachSecurityDescriptorToValue(
  value: unknown,
  descriptor: SecurityDescriptor | undefined
): unknown {
  if (!hasSecuritySignals(descriptor)) {
    return value;
  }

  if (isStructuredValue(value)) {
    applySecurityDescriptorToStructuredValue(value, descriptor);
    return value;
  }

  if (value && typeof value === 'object') {
    setExpressionProvenance(value, descriptor);
    return value;
  }

  if (typeof value === 'string') {
    return ensureStructuredValue(value, 'text', value, { security: descriptor });
  }

  return value;
}

export function applySecurityDescriptorToVariable(
  variable: Variable,
  descriptor: SecurityDescriptor | undefined,
  env: Environment
): void {
  if (!hasSecuritySignals(descriptor)) {
    return;
  }

  const mergedDescriptor = mergeOptionalSecurityDescriptors(
    env,
    getVariableSecurityDescriptor(variable),
    descriptor
  );
  if (!mergedDescriptor) {
    return;
  }

  variable.mx ??= { labels: [], taint: [], sources: [] } as any;
  updateVarMxFromDescriptor(variable.mx as any, mergedDescriptor);

  if (isStructuredValue(variable.value)) {
    applySecurityDescriptorToStructuredValue(variable.value, mergedDescriptor);
  } else if (variable.value && typeof variable.value === 'object') {
    setExpressionProvenance(variable.value, mergedDescriptor);
  }
}

export function applySecurityDescriptorToCurrentVariables(
  env: Environment,
  descriptor: SecurityDescriptor | undefined
): void {
  if (!hasSecuritySignals(descriptor)) {
    return;
  }

  for (const variable of env.getCurrentVariables().values()) {
    applySecurityDescriptorToVariable(variable, descriptor, env);
  }
}
