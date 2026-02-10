import type { GuardDefinition } from '../guards';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import type { NormalizedGuardOverride } from './guard-override-utils';
import { applyGuardOverrideFilter } from './guard-override-utils';
import { buildOperationKeys } from './guard-operation-keys';

export interface PerInputCandidate {
  index: number;
  variable: Variable;
  labels: readonly DataLabel[];
  sources: readonly string[];
  taint: readonly string[];
  guards: GuardDefinition[];
}

export function buildPerInputCandidates(
  registry: ReturnType<Environment['getGuardRegistry']>,
  inputs: readonly Variable[],
  override: NormalizedGuardOverride
): PerInputCandidate[] {
  const results: PerInputCandidate[] = [];

  for (let index = 0; index < inputs.length; index++) {
    const variable = inputs[index]!;
    const labels = Array.isArray(variable.mx?.labels) ? variable.mx.labels : [];
    const sources = Array.isArray(variable.mx?.sources) ? variable.mx.sources : [];
    const taint = Array.isArray(variable.mx?.taint) ? variable.mx.taint : [];

    const seen = new Set<string>();
    const guards: GuardDefinition[] = [];

    for (const label of labels) {
      const defs = registry.getDataGuardsForTiming(label, 'before');
      for (const def of defs) {
        if (!seen.has(def.id)) {
          seen.add(def.id);
          guards.push(def);
        }
      }
    }

    const filteredGuards = applyGuardOverrideFilter(guards, override);
    if (filteredGuards.length > 0) {
      results.push({ index, variable, labels, sources, taint, guards: filteredGuards });
    }
  }

  return results;
}

export function collectOperationGuards(
  registry: ReturnType<Environment['getGuardRegistry']>,
  operation: OperationContext,
  override: NormalizedGuardOverride
): GuardDefinition[] {
  const keys = buildOperationKeys(operation);
  const seen = new Set<string>();
  const results: GuardDefinition[] = [];

  for (const key of keys) {
    const defs = registry.getOperationGuardsForTiming(key, 'before');
    for (const def of defs) {
      if (!seen.has(def.id)) {
        seen.add(def.id);
        results.push(def);
      }
    }
  }

  return applyGuardOverrideFilter(results, override);
}
