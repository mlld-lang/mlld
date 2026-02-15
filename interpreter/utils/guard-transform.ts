import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import { createComputedVariable } from '@core/types/variable/VariableFactories';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import { isVariable } from './variable-resolution';

const GUARD_TRANSFORM_SOURCE: VariableSource = {
  directive: 'guard',
  syntax: 'code',
  hasInterpolation: false,
  isMultiLine: false
};

export function materializeGuardTransform(
  value: unknown,
  guardName: string,
  originalDescriptor: SecurityDescriptor
): Variable {
  const normalizedValue = unwrapGuardTransformValue(value);
  const descriptor = makeSecurityDescriptor({
    labels: originalDescriptor.labels,
    taint: originalDescriptor.taint,
    sources: [...originalDescriptor.sources, `guard:${guardName}`],
    policyContext: originalDescriptor.policyContext ?? undefined
  });

  const materialized =
    materializeExpressionValue(normalizedValue, { name: `guard_${guardName}_output` }) ??
    createComputedVariable(
      `guard_${guardName}_output`,
      normalizedValue,
      'js',
      '',
      GUARD_TRANSFORM_SOURCE,
      { mx: {} }
    );

  const mx = (materialized.mx ??
    {
      labels: [],
      taint: [],
      sources: [],
      policy: null
    }) as any;
  materialized.mx = mx;
  updateVarMxFromDescriptor(mx, descriptor);

  return materialized;
}

function unwrapGuardTransformValue(value: unknown): unknown {
  let current = value;
  const seen = new Set<object>();
  while (isVariable(current as Variable)) {
    if (!current || typeof current !== 'object') {
      break;
    }
    if (seen.has(current as object)) {
      break;
    }
    seen.add(current as object);
    current = (current as Variable).value;
  }
  return current;
}
