import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { updateVarMxFromDescriptor, varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { createComputedVariable } from '@core/types/variable/VariableFactories';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue
} from '@interpreter/utils/structured-value';

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
  const descriptor = makeSecurityDescriptor({
    labels: originalDescriptor.labels,
    taint: originalDescriptor.taint,
    sources: [...originalDescriptor.sources, `guard:${guardName}`],
    policyContext: originalDescriptor.policyContext ?? undefined
  });

  const materialized =
    materializeExpressionValue(value, { name: `guard_${guardName}_output` }) ??
    createComputedVariable(
      `guard_${guardName}_output`,
      value,
      'js',
      '',
      GUARD_TRANSFORM_SOURCE,
      { mx: {} }
    );

  const mergedDescriptor = mergeDescriptors(
    materialized.mx ? varMxToSecurityDescriptor(materialized.mx) : undefined,
    isStructuredValue(materialized.value) ? extractSecurityDescriptor(materialized.value) : undefined,
    descriptor
  );

  const mx = (materialized.mx ??
    {
      labels: [],
      taint: [],
      sources: [],
      policy: null
    }) as any;
  materialized.mx = mx;
  updateVarMxFromDescriptor(mx, mergedDescriptor);

  if (isStructuredValue(materialized.value)) {
    applySecurityDescriptorToStructuredValue(materialized.value, mergedDescriptor);
  }

  return materialized;
}
