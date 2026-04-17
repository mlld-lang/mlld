import { resolveFactRequirementsForOperation } from '@core/policy/fact-requirements';
import { expandOperationLabels } from '@core/policy/label-flow';
import { isHandleWrapper } from '@core/types/handle';
import type { PolicyConfig } from '@core/policy/union';
import type { Environment } from '@interpreter/env/Environment';
import { resolveNamedOperationMetadata } from '@interpreter/eval/exec/tool-metadata';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';

export type RuntimeRepairEvent = {
  kind: 'resolved_handle';
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isBareHandleToken(value: string): boolean {
  return /^h_[a-z0-9]+$/.test(value.trim());
}

function extractHandleTokenCandidate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return isBareHandleToken(trimmed) ? trimmed : undefined;
  }
  if (isHandleWrapper(value)) {
    return extractHandleTokenCandidate(value.handle);
  }
  if (isVariable(value)) {
    return extractHandleTokenCandidate(value.value);
  }
  if (isStructuredValue(value)) {
    return extractHandleTokenCandidate(value.data);
  }
  return undefined;
}

function isProjectedHandleSurface(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, 'handle')) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }

  const allowedKeys = new Set(['handle', 'value', 'preview']);
  return keys.every(key => allowedKeys.has(key));
}

async function repairProjectedHandleSurface(value: unknown, env: Environment): Promise<{
  value: unknown;
  didRepair: boolean;
}> {
  if (isProjectedHandleSurface(value)) {
    const handleToken = extractHandleTokenCandidate(value.handle);
    if (handleToken) {
      return {
        value: env.resolveHandle(handleToken),
        didRepair: true
      };
    }
    return { value, didRepair: false };
  }

  if (!Array.isArray(value)) {
    return { value, didRepair: false };
  }

  let didRepair = false;
  const repairedItems = await Promise.all(
    value.map(async entry => {
      const repaired = await repairProjectedHandleSurface(entry, env);
      if (repaired.didRepair) {
        didRepair = true;
      }
      return repaired.value;
    })
  );

  return didRepair ? { value: repairedItems, didRepair: true } : { value, didRepair: false };
}

export function collectSecurityRelevantArgNamesForOperation(options: {
  env: Environment;
  operationName: string;
  labels?: readonly string[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  sourceArgs?: readonly string[];
  hasSourceArgsMetadata?: boolean;
  policy?: PolicyConfig;
}): string[] {
  const metadata =
    options.labels !== undefined
    || options.controlArgs !== undefined
    || options.sourceArgs !== undefined
      ? {
          labels: [...(options.labels ?? [])],
          controlArgs: options.controlArgs,
          hasControlArgsMetadata: options.hasControlArgsMetadata === true,
          sourceArgs: options.sourceArgs,
          hasSourceArgsMetadata: options.hasSourceArgsMetadata === true
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
    sourceArgs: metadata.sourceArgs,
    hasSourceArgsMetadata: metadata.hasSourceArgsMetadata,
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
  if (metadata.hasSourceArgsMetadata) {
    for (const argName of metadata.sourceArgs ?? []) {
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
  const projectedResolved = await repairProjectedHandleSurface(options.value, options.env);
  const handleResolved = await resolveValueHandles(projectedResolved.value, options.env);
  return {
    value: handleResolved,
    events:
      projectedResolved.didRepair || handleResolved !== projectedResolved.value
        ? [{ kind: 'resolved_handle' }]
        : []
  };
}
