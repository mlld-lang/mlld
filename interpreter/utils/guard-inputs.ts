import type { Variable } from '@core/types/variable';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from './variable-resolution';

export interface GuardInputOptions {
  nameHint?: string;
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
      return materializeExpressionValue(value, { name: nameHint });
    })
    .filter((value): value is Variable => Boolean(value));
}
