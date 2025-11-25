import { makeSecurityDescriptor, normalizeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { createSimpleTextVariable } from '@core/types/variable';
import type { Variable } from '@core/types/variable/VariableTypes';
import type { VariableSource } from '@core/types/variable/VariableTypes';
import { updateCtxFromDescriptor, ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';

const provenanceStore = new WeakMap<object, SecurityDescriptor>();

const DEFAULT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
};

export function setExpressionProvenance(
  value: unknown,
  descriptor?: SecurityDescriptor | null
): void {
  if (!descriptor) {
    return;
  }
  if (value && typeof value === 'object') {
    provenanceStore.set(value as object, normalizeSecurityDescriptor(descriptor) ?? makeSecurityDescriptor());
  }
}

export function inheritExpressionProvenance(target: unknown, source: unknown): void {
  const descriptor = getExpressionProvenance(source) ?? descriptorFromContext(source);
  if (!descriptor) {
    return;
  }
  setExpressionProvenance(target, descriptor);
}

export function getExpressionProvenance(value: unknown): SecurityDescriptor | undefined {
  if (value && typeof value === 'object') {
    return provenanceStore.get(value as object);
  }
  return undefined;
}

export function materializeExpressionValue(
  value: unknown,
  options?: {
    name?: string;
    source?: VariableSource;
  }
): Variable | undefined {
  const descriptor = getExpressionProvenance(value);
  if (!descriptor) {
    return undefined;
  }
  const textValue = formatMaterializedValue(value);
  const variable = createSimpleTextVariable(
    options?.name ?? '__expr__',
    textValue,
    options?.source ?? DEFAULT_SOURCE,
    { ctx: {} }
  );
  if (!variable.ctx) {
    variable.ctx = {};
  }
  updateCtxFromDescriptor(variable.ctx, descriptor);
  return variable;
}

function formatMaterializedValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

function descriptorFromContext(value: unknown): SecurityDescriptor | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const ctx = (value as { ctx?: any }).ctx;
  if (!ctx) {
    return undefined;
  }
  const ctxDescriptor = ctxToSecurityDescriptor(ctx);
  return normalizeSecurityDescriptor(ctxDescriptor);
}
