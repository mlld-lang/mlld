import type { GuardDefinition } from '../guards';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import type { DataLabel } from '@core/types/security';
import type { NormalizedGuardOverride } from './guard-override-utils';
import { applyGuardOverrideFilter } from './guard-override-utils';
import { buildOperationKeys } from './guard-operation-keys';

export type GuardTiming = 'before' | 'after';

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
  override: NormalizedGuardOverride,
  timing: GuardTiming = 'before'
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
      const defs = registry.getDataGuardsForTiming(label, timing);
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

export interface OperationGuardCollectionOptions {
  timing?: GuardTiming;
  variables?: readonly Variable[];
  excludeGuardIds?: ReadonlySet<string>;
  includeDataIndexForOperationKeys?: boolean;
}

export function collectOperationGuards(
  registry: ReturnType<Environment['getGuardRegistry']>,
  operation: OperationContext,
  override: NormalizedGuardOverride,
  options: OperationGuardCollectionOptions = {}
): GuardDefinition[] {
  const timing = options.timing ?? 'before';
  const keys = buildOperationKeys(operation);
  const excluded = options.excludeGuardIds;
  const includeDataIndexForOperationKeys = options.includeDataIndexForOperationKeys ?? true;
  const seen = new Set<string>();
  const results: GuardDefinition[] = [];

  const addDefinitions = (defs: readonly GuardDefinition[]): void => {
    for (const def of defs) {
      if (excluded?.has(def.id) || seen.has(def.id)) {
        continue;
      }
      seen.add(def.id);
      results.push(def);
    }
  };

  for (const key of keys) {
    addDefinitions(registry.getOperationGuardsForTiming(key, timing));
    if (includeDataIndexForOperationKeys) {
      const dataLookup = registry as {
        getDataGuardsForTiming?: (label: string, guardTiming: GuardTiming) => GuardDefinition[];
      };
      if (typeof dataLookup.getDataGuardsForTiming === 'function') {
        addDefinitions(dataLookup.getDataGuardsForTiming(key, timing));
      }
    }
  }

  if (options.variables && options.variables.length > 0) {
    for (const variable of options.variables) {
      const labels = Array.isArray(variable.mx?.labels) ? variable.mx.labels : [];
      for (const label of labels) {
        addDefinitions(registry.getOperationGuardsForTiming(label, timing));
      }
    }
  }

  return applyGuardOverrideFilter(results, override);
}
