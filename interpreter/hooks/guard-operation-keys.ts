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
  const commandOpTypes = new Set(['cmd', 'sh', 'js', 'node', 'py', 'prose']);
  const operationType =
    typeof operation.type === 'string' && operation.type.length > 0
      ? operation.type.toLowerCase()
      : undefined;
  let hasCommandSubtype = false;

  if (operationType) {
    keys.add(operationType);
    if (operationType === 'run') {
      keys.add('exe');
    }
  }

  if (operation.subtype) {
    keys.add(operation.subtype.toLowerCase());
  }
  if (operationType === 'run') {
    const runSubtype =
      typeof operation.metadata === 'object' && operation.metadata
        ? (operation.metadata as Record<string, unknown>).runSubtype
        : undefined;
    if (typeof runSubtype === 'string') {
      const normalizedRunSubtype = runSubtype.toLowerCase();
      keys.add(normalizedRunSubtype);
      if (normalizedRunSubtype === 'runcommand') {
        keys.add('cmd');
        hasCommandSubtype = true;
      } else if (normalizedRunSubtype.startsWith('runexec')) {
        keys.add('exec');
      } else if (normalizedRunSubtype === 'runcode') {
        const language =
          typeof operation.metadata === 'object' && operation.metadata
            ? (operation.metadata as Record<string, unknown>).language
            : undefined;
        if (typeof language === 'string' && language.length > 0) {
          const normalizedLanguage = language.toLowerCase();
          keys.add(normalizedLanguage);
          if (commandOpTypes.has(normalizedLanguage)) {
            hasCommandSubtype = true;
          }
        }
      }
    }
  }

  if (operation.opLabels && operation.opLabels.length > 0) {
    for (const label of operation.opLabels) {
      if (typeof label === 'string' && label.length > 0) {
        const normalizedLabel = label.toLowerCase();
        keys.add(normalizedLabel);
        if (normalizedLabel.startsWith('op:')) {
          const [prefix, opType] = normalizedLabel.split(':');
          if (prefix === 'op' && opType && commandOpTypes.has(opType)) {
            keys.add(opType);
            hasCommandSubtype = true;
          }
        }
      }
    }
  }

  if (operation.labels && operation.labels.length > 0) {
    for (const label of operation.labels) {
      if (typeof label === 'string' && label.length > 0) {
        keys.add(label.toLowerCase());
      }
    }
  }

  if (operationType === 'exe' && hasCommandSubtype) {
    keys.add('run');
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
