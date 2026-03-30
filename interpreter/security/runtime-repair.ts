import { resolveFactRequirementsForOperation } from '@core/policy/fact-requirements';
import { expandOperationLabels } from '@core/policy/label-flow';
import type { PolicyConfig } from '@core/policy/union';
import type { Environment } from '@interpreter/env/Environment';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';

export type RuntimeRepairEvent = {
  kind: 'resolved_handle';
};

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
  dropAmbiguousArrayElements?: boolean;
  collapseEquivalentProjectedMatches?: boolean;
}): Promise<{ value: unknown; events: RuntimeRepairEvent[] }> {
  const handleResolved = await resolveValueHandles(options.value, options.env);
  return {
    value: handleResolved,
    events: handleResolved !== options.value ? [{ kind: 'resolved_handle' }] : []
  };
}
