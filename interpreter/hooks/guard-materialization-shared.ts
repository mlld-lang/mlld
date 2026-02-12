import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';

export function truncateGuardPreview(value: string, limit = 160): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
}

export function cloneGuardInputVariable(variable: Variable): Variable {
  const clone: Variable = {
    ...variable,
    name: 'input',
    mx: {
      ...(variable.mx ?? {})
    },
    internal: {
      ...(variable.internal ?? {}),
      isReserved: true,
      isSystem: true
    }
  };
  if (clone.mx?.mxCache) {
    delete clone.mx.mxCache;
  }
  return clone;
}

export function cloneGuardVariableWithDescriptor(
  variable: Variable,
  descriptor: SecurityDescriptor
): Variable {
  const clone: Variable = {
    ...variable,
    mx: {
      ...(variable.mx ?? {})
    },
    internal: {
      ...(variable.internal ?? {})
    }
  };
  if (!clone.mx) {
    clone.mx = {} as any;
  }
  updateVarMxFromDescriptor(clone.mx, descriptor);
  if (clone.mx?.mxCache) {
    delete clone.mx.mxCache;
  }
  return clone;
}

export function resolveGuardMaterializedValue(
  variable: Variable | undefined,
  fallback: Variable,
  buildPreview: (variable: Variable) => string | null
): unknown {
  const candidate = (variable as any)?.value ?? (fallback as any)?.value ?? variable ?? fallback;
  if (candidate && typeof candidate === 'object') {
    if (typeof (candidate as any).text === 'string') {
      return (candidate as any).text;
    }
    if (typeof (candidate as any).data === 'string') {
      return (candidate as any).data;
    }
  }
  if (candidate === undefined || candidate === null) {
    return buildPreview(fallback) ?? '';
  }
  return candidate;
}
