import type { GuardResult } from '@core/types/guard';
import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { varMxToSecurityDescriptor, updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import type { EvalResult } from '../core/interpreter';
import type { GuardDefinition } from '../guards/GuardRegistry';
import { extractSecurityDescriptor } from '../utils/structured-value';
import { applyGuardLabelModifications } from './guard-utils';

export function extractOutputDescriptor(result: EvalResult, output?: Variable): SecurityDescriptor {
  const valueDescriptor = extractSecurityDescriptor(result.value, {
    recursive: true,
    mergeArrayElements: true
  });
  const resultDescriptor =
    result && typeof result === 'object' && 'mx' in result
      ? extractSecurityDescriptor((result as Record<string, unknown>).mx, { recursive: true })
      : undefined;
  const outputDescriptor = output?.mx ? varMxToSecurityDescriptor(output.mx) : undefined;
  return mergeDescriptors(valueDescriptor, resultDescriptor, outputDescriptor, makeSecurityDescriptor());
}

export function mergeDescriptorWithFallbackInputs(
  current: SecurityDescriptor,
  inputVariables: readonly Variable[]
): SecurityDescriptor {
  const merged = mergeDescriptors(
    current,
    ...inputVariables
      .map(variable => extractSecurityDescriptor(variable, { recursive: true, mergeArrayElements: true }))
      .filter(Boolean) as SecurityDescriptor[]
  );
  return merged ?? current;
}

export function mergeGuardDescriptor(
  current: SecurityDescriptor,
  replacements: readonly Variable[],
  guard: GuardDefinition,
  labelModifications?: GuardResult['labelModifications']
): SecurityDescriptor {
  const guardSource = guard.name ?? guard.filterValue ?? 'guard';
  const descriptors: SecurityDescriptor[] = [current];
  for (const variable of replacements) {
    const descriptor = extractSecurityDescriptor(variable, {
      recursive: true,
      mergeArrayElements: true
    });
    if (descriptor) {
      descriptors.push(descriptor);
    }
  }
  descriptors.push(makeSecurityDescriptor({ sources: [`guard:${guardSource}`] }));
  const merged = mergeDescriptors(...descriptors);
  return applyGuardLabelModifications(merged, labelModifications, guard);
}

export function applyDescriptorToVariables(
  descriptor: SecurityDescriptor,
  variables: readonly Variable[]
): void {
  for (const variable of variables) {
    const mx = (variable.mx ?? (variable.mx = {} as any)) as Record<string, unknown>;
    updateVarMxFromDescriptor(mx, descriptor);
    if ('mxCache' in mx) {
      delete (mx as any).mxCache;
    }
  }
}
