import type { Variable } from '@core/types/variable';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from './variable-resolution';
import { resolveNestedValue } from './display-materialization';

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
      return materializeExpressionValue(normalized, { name: nameHint });
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
      return materializeExpressionValue(normalized, { name: nameHint });
    })();

    if (variable) {
      results.push({ index, variable });
    }
  }

  return results;
}
