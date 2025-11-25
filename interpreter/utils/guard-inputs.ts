import type { Variable, VariableSource } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from './variable-resolution';
import { resolveNestedValue } from './display-materialization';
import { extractSecurityDescriptor } from './structured-value';
import { makeSecurityDescriptor } from '@core/types/security';
import { updateCtxFromDescriptor } from '@core/types/variable/CtxHelpers';

const FALLBACK_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
};

export interface GuardInputOptions {
  nameHint?: string;
}

export interface GuardInputMappingEntry {
  index: number;
  variable: Variable;
}

export function materializeGuardInputs(
  values: readonly unknown[],
  options?: GuardInputOptions
): Variable[] {
  const nameHint = options?.nameHint ?? '__guard_input__';
  return values
    .map(value => {
      if (isVariable(value)) {
        return value;
      }
      const normalized = resolveNestedValue(value, { preserveProvenance: true });
      const materialized = materializeExpressionValue(normalized, { name: nameHint });
      if (materialized) {
        return materialized;
      }
      const fallback = createSimpleTextVariable(
        nameHint,
        formatGuardInputValue(normalized),
        FALLBACK_SOURCE,
        { ctx: {} }
      );
      applyDescriptorFromValue(normalized, fallback);
      return fallback;
    })
    .filter((value): value is Variable => Boolean(value));
}

export function materializeGuardInputsWithMapping(
  values: readonly unknown[],
  options?: GuardInputOptions
): GuardInputMappingEntry[] {
  const nameHint = options?.nameHint ?? '__guard_input__';
  const results: GuardInputMappingEntry[] = [];

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    const variable = (() => {
      if (isVariable(value)) {
        return value;
      }
      const normalized = resolveNestedValue(value, { preserveProvenance: true });
      const materialized = materializeExpressionValue(normalized, { name: nameHint });
      if (materialized) {
        return materialized;
      }
      const fallback = createSimpleTextVariable(
        nameHint,
        formatGuardInputValue(normalized),
        FALLBACK_SOURCE,
        { ctx: {} }
      );
      applyDescriptorFromValue(normalized, fallback);
      return fallback;
    })();

    if (variable) {
      results.push({ index, variable });
    }
  }

  return results;
}

function formatGuardInputValue(value: unknown): string {
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

function applyDescriptorFromValue(value: unknown, target: Variable): void {
  const descriptor =
    extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true }) ??
    makeSecurityDescriptor();
  if (!target.ctx) {
    target.ctx = {};
  }
  updateCtxFromDescriptor(target.ctx, descriptor);
  if ((target.ctx as any).ctxCache) {
    delete (target.ctx as any).ctxCache;
  }
}
