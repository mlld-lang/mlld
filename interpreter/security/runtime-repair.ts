import { resolveFactRequirementsForOperation } from '@core/policy/fact-requirements';
import { expandOperationLabels } from '@core/policy/label-flow';
import { MlldSecurityError } from '@core/errors';
import type { PolicyConfig } from '@core/policy/union';
import type { Environment } from '@interpreter/env/Environment';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
import { canonicalizeProjectedValue } from '@interpreter/utils/projected-value-canonicalization';
import { materializeSessionProofMatches } from '@interpreter/utils/session-proof-matching';

export type RuntimeRepairEvent =
  | { kind: 'resolved_handle' }
  | { kind: 'canonicalized_projected_value' }
  | { kind: 'rebound_session_proof' }
  | { kind: 'ambiguous_projected_value'; error: MlldSecurityError };

export function collectSecurityRelevantArgNamesForOperation(options: {
  env: Environment;
  operationName: string;
  labels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  policy?: PolicyConfig;
}): string[] {
  const metadata =
    options.labels !== undefined || options.controlArgs !== undefined
      ? {
          labels: [...(options.labels ?? [])],
          controlArgs: options.controlArgs,
          hasControlArgsMetadata: options.hasControlArgsMetadata === true
        }
      : resolveNamedOperationMetadata(options.env, options.operationName);

  if (!metadata) {
    return [];
  }

  const resolution = resolveFactRequirementsForOperation({
    opRef: options.operationName,
    operationLabels: expandOperationLabels(
      metadata.labels,
      options.policy?.operations
    ),
    controlArgs: metadata.controlArgs,
    hasControlArgsMetadata: metadata.hasControlArgsMetadata,
    policy: options.policy
  });

  const argNames = new Set(Object.keys(resolution.requirementsByArg));
  if (metadata.hasControlArgsMetadata) {
    for (const argName of metadata.controlArgs ?? []) {
      if (typeof argName === 'string' && argName.trim().length > 0) {
        argNames.add(argName);
      }
    }
  }

  return [...argNames];
}

export async function repairSecurityRelevantValue(options: {
  value: unknown;
  env: Environment;
  matchScope?: 'session' | 'global';
  includeSessionProofMatches?: boolean;
  preserveOnAmbiguous?: boolean;
}): Promise<{ value: unknown; events: RuntimeRepairEvent[] }> {
  const events: RuntimeRepairEvent[] = [];
  const matchScope = options.matchScope ?? 'session';
  // Same-session proof rebinding is narrower than alias canonicalization. Callers
  // must opt in so handle-only projections do not silently widen into bare literals.
  const includeSessionProofMatches = options.includeSessionProofMatches === true;

  const handleResolved = await resolveValueHandles(options.value, options.env);
  if (handleResolved !== options.value) {
    events.push({ kind: 'resolved_handle' });
  }

  let repaired = handleResolved;
  try {
    const canonicalized = await canonicalizeProjectedValue(handleResolved, options.env, {
      matchScope
    });
    if (canonicalized !== handleResolved) {
      events.push({ kind: 'canonicalized_projected_value' });
    }
    repaired = canonicalized;
  } catch (error) {
    if (
      error instanceof MlldSecurityError
      && error.code === 'AMBIGUOUS_PROJECTED_VALUE'
      && options.preserveOnAmbiguous === true
    ) {
      events.push({ kind: 'ambiguous_projected_value', error });
      return {
        value: handleResolved,
        events
      };
    }
    throw error;
  }

  if (includeSessionProofMatches) {
    const rebound = materializeSessionProofMatches(repaired, options.env);
    if (rebound !== repaired) {
      events.push({ kind: 'rebound_session_proof' });
      repaired = rebound;
    }
  }

  return {
    value: repaired,
    events
  };
}
