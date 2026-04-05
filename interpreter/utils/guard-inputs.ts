import type { Variable, VariableSource } from '@core/types/variable';
import {
  createArrayVariable,
  createObjectVariable,
  createStructuredValueVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from './variable-resolution';
import { resolveNestedValue } from './display-materialization';
import {
  asData,
  ensureStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue
} from './structured-value';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';

const FALLBACK_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
};

export interface GuardInputOptions {
  nameHint?: string;
  argNames?: readonly (string | null | undefined)[];
}

export interface GuardInputMappingEntry {
  index: number;
  variable: Variable;
  name?: string | null;
}

export function materializeGuardInputs(
  values: readonly unknown[],
  options?: GuardInputOptions
): Variable[] {
  const nameHint = options?.nameHint ?? '__guard_input__';
  return values
    .map(value => materializeGuardInput(value, nameHint))
    .filter((value): value is Variable => Boolean(value));
}

export function materializeGuardInputsWithMapping(
  values: readonly unknown[],
  options?: GuardInputOptions
): GuardInputMappingEntry[] {
  const nameHint = options?.nameHint ?? '__guard_input__';
  const argNames = options?.argNames;
  const results: GuardInputMappingEntry[] = [];

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    const variable = materializeGuardInput(value, nameHint);
    const argName = (() => {
      if (!Array.isArray(argNames)) {
        return null;
      }
      const candidate = argNames[index];
      return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
    })();

    if (variable) {
      results.push({ index, variable, name: argName });
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

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function materializeGuardInput(value: unknown, nameHint: string): Variable | undefined {
  if (isVariable(value)) {
    if (isStructuredValue(value.value)) {
      const structuredValue = ensureStructuredValue(value.value);
      const data = asData(structuredValue);
      if (data === null || (typeof data !== 'object' && typeof data !== 'function')) {
        const materialized = materializeExpressionValue(data, { name: value.name || nameHint })
          ?? createSimpleTextVariable(value.name || nameHint, formatGuardInputValue(data), FALLBACK_SOURCE, { mx: {} });
        materialized.name = value.name || nameHint;
        materialized.source = value.source;
        materialized.internal = {
          ...(value.internal ?? {}),
          ...(materialized.internal ?? {})
        };
        materialized.metadata = {
          ...(value.metadata ?? {}),
          ...(materialized.metadata ?? {})
        };
        applyDescriptorFromValue(structuredValue, materialized);
        if (value.mx) {
          materialized.mx = {
            ...(materialized.mx ?? {}),
            ...value.mx
          };
          if ((materialized.mx as any).mxCache) {
            delete (materialized.mx as any).mxCache;
          }
        }
        return materialized;
      }
    }
    return value;
  }

  if (isStructuredValue(value)) {
    const structuredValue = ensureStructuredValue(value);
    const data = asData(structuredValue);
    if (data === null || (typeof data !== 'object' && typeof data !== 'function')) {
      const materialized = materializeExpressionValue(data, { name: nameHint })
        ?? createSimpleTextVariable(nameHint, formatGuardInputValue(data), FALLBACK_SOURCE, { mx: {} });
      applyDescriptorFromValue(structuredValue, materialized);
      if (structuredValue.mx.schema !== undefined) {
        materialized.mx.schema = structuredValue.mx.schema;
      }
      if (structuredValue.mx.factsources !== undefined) {
        materialized.mx.factsources = [...structuredValue.mx.factsources];
      }
      return materialized;
    }

    const variable = createStructuredValueVariable(nameHint, structuredValue, FALLBACK_SOURCE, {
      mx: {
        schema: structuredValue.mx.schema,
        factsources: structuredValue.mx.factsources
      }
    });
    applyDescriptorFromValue(structuredValue, variable);
    if (structuredValue.mx.schema !== undefined) {
      variable.mx.schema = structuredValue.mx.schema;
    }
    if (structuredValue.mx.factsources !== undefined) {
      variable.mx.factsources = [...structuredValue.mx.factsources];
    }
    return variable;
  }

  const normalized = resolveNestedValue(value, { preserveProvenance: true });
  if (Array.isArray(normalized)) {
    const variable = createArrayVariable(nameHint, normalized, false, FALLBACK_SOURCE, { mx: {} });
    applyDescriptorFromValue(value, variable);
    return variable;
  }

  if (isPlainObjectValue(normalized)) {
    const variable = createObjectVariable(nameHint, normalized, false, FALLBACK_SOURCE, { mx: {} });
    applyDescriptorFromValue(value, variable);
    return variable;
  }

  const materialized = materializeExpressionValue(normalized, { name: nameHint });
  if (materialized) {
    applyDescriptorFromValue(value, materialized);
    return materialized;
  }

  const fallback = createSimpleTextVariable(
    nameHint,
    formatGuardInputValue(normalized),
    FALLBACK_SOURCE,
    { mx: {} }
  );
  applyDescriptorFromValue(value, fallback);
  return fallback;
}

function applyDescriptorFromValue(value: unknown, target: Variable): void {
  const descriptor = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
  if (!descriptor) {
    return;
  }
  if (!target.mx) {
    target.mx = {};
  }
  updateVarMxFromDescriptor(target.mx, descriptor);
  if ((target.mx as any).mxCache) {
    delete (target.mx as any).mxCache;
  }
}
