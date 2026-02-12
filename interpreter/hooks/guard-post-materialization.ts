import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import {
  cloneGuardInputVariable,
  cloneGuardVariableWithDescriptor,
  resolveGuardMaterializedValue,
  truncateGuardPreview
} from './guard-materialization-shared';

export function truncatePostPreview(value: string, limit = 160): string {
  return truncateGuardPreview(value, limit);
}

export function buildPostVariablePreview(variable: Variable): string | null {
  try {
    const value = (variable as any).value;
    if (typeof value === 'string') {
      return truncatePostPreview(value);
    }
    if (value && typeof value === 'object') {
      if (typeof (value as any).text === 'string') {
        return truncatePostPreview((value as any).text);
      }
      return truncatePostPreview(JSON.stringify(value));
    }
    if (value === null || value === undefined) {
      return null;
    }
    return truncatePostPreview(String(value));
  } catch {
    return null;
  }
}

export function clonePostGuardVariable(variable: Variable): Variable {
  return cloneGuardInputVariable(variable);
}

export function clonePostGuardVariableWithDescriptor(
  variable: Variable,
  descriptor: SecurityDescriptor
): Variable {
  return cloneGuardVariableWithDescriptor(variable, descriptor);
}

export function resolvePostGuardValue(variable: Variable | undefined, fallback: Variable): unknown {
  return resolveGuardMaterializedValue(variable, fallback, buildPostVariablePreview);
}
