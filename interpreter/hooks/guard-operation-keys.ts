import type { OperationContext } from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import { buildArrayAggregate } from '@core/types/variable/ArrayHelpers';
import type { ArrayAggregateSnapshot } from '@core/types/variable/ArrayHelpers';
import type { DataLabel } from '@core/types/security';

export interface OperationSnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  taint: readonly string[];
  aggregate: ArrayAggregateSnapshot;
  variables: readonly Variable[];
}

export function buildOperationSnapshot(inputs: readonly Variable[]): OperationSnapshot {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_input__' });
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    taint: aggregate.taint,
    aggregate,
    variables: inputs
  };
}

export function buildOperationKeys(operation: OperationContext): string[] {
  const keys = new Set<string>();
  if (operation.type) {
    keys.add(operation.type.toLowerCase());
  }
  if (operation.subtype) {
    keys.add(operation.subtype.toLowerCase());
  }
  if (operation.type === 'run') {
    const runSubtype =
      typeof operation.metadata === 'object' && operation.metadata
        ? (operation.metadata as Record<string, unknown>).runSubtype
        : undefined;
    if (typeof runSubtype === 'string') {
      keys.add(runSubtype.toLowerCase());
      if (runSubtype === 'runCommand') {
        keys.add('cmd');
      } else if (runSubtype.startsWith('runExec')) {
        keys.add('exec');
      } else if (runSubtype === 'runCode') {
        const language =
          typeof operation.metadata === 'object' && operation.metadata
            ? (operation.metadata as Record<string, unknown>).language
            : undefined;
        if (typeof language === 'string' && language.length > 0) {
          keys.add(language.toLowerCase());
        }
      }
    }
  }

  if (operation.opLabels && operation.opLabels.length > 0) {
    for (const label of operation.opLabels) {
      if (typeof label === 'string' && label.length > 0) {
        keys.add(label.toLowerCase());
      }
    }
  }

  return Array.from(keys);
}

export function buildOperationKeySet(operation: OperationContext): Set<string> {
  const keys = buildOperationKeys(operation);
  const normalized = new Set<string>();
  for (const key of keys) {
    normalized.add(key.toLowerCase());
  }
  return normalized;
}
