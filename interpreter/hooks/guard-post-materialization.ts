import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';

export function truncatePostPreview(value: string, limit = 160): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}…`;
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

export function clonePostGuardVariableWithDescriptor(
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

export function resolvePostGuardValue(variable: Variable | undefined, fallback: Variable): unknown {
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
    return buildPostVariablePreview(fallback) ?? '';
  }
  return candidate;
}
