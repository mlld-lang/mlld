import type { OperationContext } from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import { buildArrayAggregate } from '@core/types/variable/ArrayHelpers';
import type { ArrayAggregateSnapshot } from '@core/types/variable/ArrayHelpers';
import type { DataLabel, ToolProvenance } from '@core/types/security';

export interface OperationSnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  taint: readonly string[];
  attestations: readonly DataLabel[];
  toolsHistory: readonly ToolProvenance[];
  aggregate: ArrayAggregateSnapshot;
  variables: readonly Variable[];
}

export function buildOperationSnapshot(inputs: readonly Variable[]): OperationSnapshot {
  const aggregate = buildArrayAggregate(inputs, { nameHint: '__guard_input__' });
  return {
    labels: aggregate.labels,
    sources: aggregate.sources,
    taint: aggregate.taint,
    attestations: collectAttestations(inputs),
    toolsHistory: collectToolHistory(inputs),
    aggregate,
    variables: inputs
  };
}

function collectAttestations(inputs: readonly Variable[]): readonly DataLabel[] {
  const labels = new Set<DataLabel>();
  for (const variable of inputs) {
    for (const attestation of variable.mx?.attestations ?? []) {
      labels.add(attestation);
    }
  }
  return Array.from(labels);
}

function collectToolHistory(inputs: readonly Variable[]): readonly ToolProvenance[] {
  const history: ToolProvenance[] = [];
  const seenAuditRefs = new Set<string>();

  for (const variable of inputs) {
    const tools = Array.isArray(variable.mx?.tools) ? variable.mx.tools : [];
    for (const tool of tools) {
      if (tool.auditRef) {
        if (seenAuditRefs.has(tool.auditRef)) {
          continue;
        }
        seenAuditRefs.add(tool.auditRef);
      }
      history.push(tool);
    }
  }

  return history;
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
