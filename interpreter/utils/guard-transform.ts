import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { Variable, VariableSource } from '@core/types/variable';
import { updateCtxFromDescriptor } from '@core/types/variable/CtxHelpers';
import { createComputedVariable } from '@core/types/variable/VariableFactories';
import { materializeExpressionValue } from '@core/types/provenance/ExpressionProvenance';

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
    taintLevel: originalDescriptor.taintLevel,
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
      { ctx: {} }
    );

  const ctx = (materialized.ctx ??
    {
      labels: [],
      taint: 'unknown',
      sources: [],
      policy: null
    }) as any;
  materialized.ctx = ctx;
  updateCtxFromDescriptor(ctx, descriptor);

  return materialized;
}
