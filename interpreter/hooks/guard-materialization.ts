import type { GuardScope } from '../guards';
import type { Variable } from '@core/types/variable';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import { isVariable } from '../utils/variable-resolution';
import type { PerInputCandidate } from './guard-candidate-selection';
import type { OperationSnapshot } from './guard-operation-keys';
import {
  cloneGuardInputVariable,
  cloneGuardVariableWithDescriptor,
  resolveGuardMaterializedValue,
  truncateGuardPreview
} from './guard-materialization-shared';

export function truncatePreview(value: string, limit = 160): string {
  return truncateGuardPreview(value, limit);
}

export function hasSecretLabel(variable: Variable): boolean {
  const labels = Array.isArray(variable.mx?.labels) ? variable.mx!.labels : [];
  return labels.includes('secret') || labels.includes('sensitive');
}

export function hasSecretLabelInArray(labels: readonly DataLabel[]): boolean {
  return labels.includes('secret') || labels.includes('sensitive');
}

export function redactVariableForErrorOutput(_variable: Variable): string {
  return '[REDACTED]';
}

export function buildVariablePreview(variable: Variable): string | null {
  if (hasSecretLabel(variable)) {
    return '[REDACTED]';
  }
  try {
    const value = (variable as any).value;
    if (typeof value === 'string') {
      return truncatePreview(value);
    }
    if (value && typeof value === 'object') {
      if (typeof (value as any).text === 'string') {
        return truncatePreview((value as any).text);
      }
      return truncatePreview(JSON.stringify(value));
    }
    if (value === null || value === undefined) {
      return null;
    }
    return truncatePreview(String(value));
  } catch {
    return null;
  }
}

export function buildInputPreview(
  scope: GuardScope,
  perInput?: PerInputCandidate,
  operationSnapshot?: OperationSnapshot
): string | null {
  if (scope === 'perInput' && perInput) {
    if (hasSecretLabelInArray(perInput.labels)) {
      return '[REDACTED]';
    }
    return buildVariablePreview(perInput.variable);
  }
  if (scope === 'perOperation' && operationSnapshot) {
    return `Array(len=${operationSnapshot.variables.length})`;
  }
  return null;
}

export function cloneVariableForGuard(variable: Variable): Variable {
  return cloneGuardInputVariable(variable);
}

export function cloneVariableForReplacement(
  variable: Variable,
  descriptor: SecurityDescriptor
): Variable {
  return cloneGuardVariableWithDescriptor(variable, descriptor);
}

export function resolveGuardValue(variable: Variable | undefined, fallback: Variable): unknown {
  return resolveGuardMaterializedValue(variable, fallback, buildVariablePreview);
}

export function normalizeGuardReplacements(value: unknown): Variable[] {
  if (isVariable(value as Variable)) {
    return [value as Variable];
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).filter(item => isVariable(item as Variable)) as Variable[];
  }
  return [];
}
