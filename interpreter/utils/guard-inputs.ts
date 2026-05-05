import type { Variable, VariableSource } from '@core/types/variable';
import {
  createArrayVariable,
  createObjectVariable,
  createStructuredValueVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import {
  inheritExpressionProvenance,
  materializeExpressionValue
} from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from './variable-resolution';
import { resolveNestedValue } from './display-materialization';
import {
  ensureStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue,
  stringifyStructured
} from './structured-value';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { createASTAwareJSONReplacer } from './ast-evaluation';

const FALLBACK_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
};

export interface GuardInputOptions {
  nameHint?: string;
  argNames?: readonly (string | null | undefined)[];
  preserveStructuredScalars?: boolean;
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
    .map(value => materializeGuardInput(value, nameHint, options))
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
    const variable = materializeGuardInput(value, nameHint, options);
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
      return stringifyStructured(value);
    } catch {
      try {
        return JSON.stringify(value, createASTAwareJSONReplacer());
      } catch {
        return '[object]';
      }
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

function cloneGuardCompositeValue(value: unknown): unknown {
  if (isVariable(value)) {
    return cloneGuardCompositeValue(value.value);
  }

  if (isStructuredValue(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    const cloned = value.map(entry => cloneGuardCompositeValue(entry));
    inheritExpressionProvenance(cloned, value);
    return cloned;
  }

  if (isPlainObjectValue(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneGuardCompositeValue(entry);
    }
    inheritExpressionProvenance(cloned, value);
    return cloned;
  }

  return value;
}

function isStructuredScalar(value: { data: unknown }): boolean {
  const data = value.data;
  return data === null || (typeof data !== 'object' && typeof data !== 'function');
}

function markStructuredScalarPreservation(variable: Variable): Variable {
  variable.internal = {
    ...(variable.internal ?? {}),
    preserveStructuredGuardValue: true
  };
  return variable;
}

function materializeStructuredScalar(
  structuredValue: ReturnType<typeof ensureStructuredValue>,
  name: string
): Variable {
  const data = structuredValue.data;
  const materialized = materializeExpressionValue(data, { name })
    ?? createSimpleTextVariable(name, formatGuardInputValue(data), FALLBACK_SOURCE, { mx: {} });
  applyDescriptorFromValue(structuredValue, materialized);
  if (structuredValue.mx.schema !== undefined) {
    materialized.mx.schema = structuredValue.mx.schema;
  }
  if (structuredValue.mx.factsources !== undefined) {
    materialized.mx.factsources = [...structuredValue.mx.factsources];
  }
  return materialized;
}

function materializeGuardInput(
  value: unknown,
  nameHint: string,
  options?: GuardInputOptions
): Variable | undefined {
  if (isVariable(value)) {
    if (isStructuredValue(value.value)) {
      const structuredValue = ensureStructuredValue(value.value);
      const preserveStructuredScalars =
        options?.preserveStructuredScalars === true
        || value.internal?.preserveStructuredGuardValue === true;
      const materialized =
        !preserveStructuredScalars && isStructuredScalar(structuredValue)
          ? materializeStructuredScalar(structuredValue, value.name || nameHint)
          : createStructuredValueVariable(value.name || nameHint, structuredValue, FALLBACK_SOURCE, {
              mx: {
                schema: structuredValue.mx.schema,
                factsources: structuredValue.mx.factsources
              }
            });
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
      if (preserveStructuredScalars) {
        markStructuredScalarPreservation(materialized);
      }
      return materialized;
    }
    return value;
  }

  if (isStructuredValue(value)) {
    const structuredValue = ensureStructuredValue(value);
    const preserveStructuredScalars = options?.preserveStructuredScalars === true;
    const variable =
      !preserveStructuredScalars && isStructuredScalar(structuredValue)
        ? materializeStructuredScalar(structuredValue, nameHint)
        : createStructuredValueVariable(nameHint, structuredValue, FALLBACK_SOURCE, {
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
    if (preserveStructuredScalars) {
      markStructuredScalarPreservation(variable);
    }
    return variable;
  }

  const normalized = cloneGuardCompositeValue(value);
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

  const scalarNormalized = resolveNestedValue(value, { preserveProvenance: true });
  if (scalarNormalized !== normalized) {
    const materialized = materializeExpressionValue(scalarNormalized, { name: nameHint });
    if (materialized) {
      applyDescriptorFromValue(value, materialized);
      return materialized;
    }
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
