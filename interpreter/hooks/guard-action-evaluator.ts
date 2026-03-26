import { astLocationToSourceLocation } from '@core/types';
import { MlldWhenExpressionError } from '@core/errors';
import type { GuardActionNode } from '@core/types/guard';
import type { PolicyConfig } from '@core/policy/union';
import { normalizePolicyConfig } from '@core/policy/union';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { GuardContextSnapshot } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import type { GuardDefinition } from '../guards';
import { evaluate } from '../core/interpreter';
import { isStructuredValue } from '../utils/structured-value';
import { materializeGuardTransform } from '../utils/guard-transform';
import { extractVariableValue, isVariable } from '../utils/variable-resolution';
import {
  cloneVariableForReplacement,
  hasSecretLabel,
  redactVariableForErrorOutput
} from './guard-materialization';
import { formatGuardFilterForMetadata } from './guard-filter-display';
import type { GuardAttemptEntry } from './guard-retry-state';
import {
  applyGuardLabelModifications,
  extractGuardLabelModifications,
  logGuardLabelModifications
} from './guard-utils';

export interface BuildDecisionMetadataExtras {
  hint?: string | null;
  inputPreview?: string | null;
  attempt?: number;
  tries?: GuardAttemptEntry[];
  inputVariable?: Variable;
  contextSnapshot?: GuardContextSnapshot;
  scopeKey?: string;
  guardActionMatched?: boolean;
}

export interface GuardEnvActionResolution {
  envConfig?: unknown;
  policyFragment?: PolicyConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function evaluateGuardReplacement(
  action: GuardActionNode | undefined,
  guardEnv: Environment,
  guard: GuardDefinition,
  inputVariable: Variable
): Promise<Variable | undefined> {
  if (!action || action.decision !== 'allow') {
    return undefined;
  }

  const { evaluate } = await import('../core/interpreter');
  const labelModifications = extractGuardLabelModifications(action);
  const baseDescriptor = inputVariable.mx
    ? varMxToSecurityDescriptor(inputVariable.mx)
    : makeSecurityDescriptor();
  const modifiedDescriptor = applyGuardLabelModifications(
    baseDescriptor,
    labelModifications,
    guard
  );
  const guardLabel = guard.name ?? guard.filterValue ?? 'guard';
  await logGuardLabelModifications(guardEnv, guard, labelModifications, [inputVariable]);

  if (action.value && action.value.length > 0) {
    const result = await evaluate(action.value, guardEnv, {
      privileged: guard.privileged === true
    });
    let value = result?.value ?? result;
    if (isVariable(value as Variable)) {
      value = (value as Variable).value;
    }
    return materializeGuardTransform(value, guardLabel, modifiedDescriptor);
  }

  if (!labelModifications) {
    return undefined;
  }

  const guardDescriptor = mergeDescriptors(
    modifiedDescriptor,
    makeSecurityDescriptor({ sources: [`guard:${guardLabel}`] })
  );
  return cloneVariableForReplacement(inputVariable, guardDescriptor);
}

export async function resolveGuardEnvConfig(
  action: GuardActionNode,
  guardEnv: Environment
): Promise<unknown> {
  const resolved = await resolveGuardEnvDecision(action, guardEnv);
  return resolved.envConfig;
}

export async function resolveGuardEnvDecision(
  action: GuardActionNode,
  guardEnv: Environment
): Promise<GuardEnvActionResolution> {
  if (!action.value || action.value.length === 0) {
    const location = astLocationToSourceLocation(action.location, guardEnv.getCurrentFilePath());
    throw new MlldWhenExpressionError(
      'Guard env actions require a config value: env @config',
      location,
      location?.filePath ? { filePath: location.filePath, sourceContent: guardEnv.getSource(location.filePath) } : undefined,
      { env: guardEnv }
    );
  }

  const result = await evaluate(action.value, guardEnv, { isExpression: true });
  let value = result.value;
  if (isVariable(value as Variable)) {
    value = await extractVariableValue(value as Variable, guardEnv);
  }
  if (isStructuredValue(value)) {
    value = value.data;
  }

  let envConfig: unknown = value;
  let policyFragment: PolicyConfig | undefined;
  if (isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, 'policy')) {
    const rawPolicy = (value as Record<string, unknown>).policy;
    if (rawPolicy !== undefined && rawPolicy !== null) {
      if (!isPlainObject(rawPolicy)) {
        const location = astLocationToSourceLocation(action.location, guardEnv.getCurrentFilePath());
        throw new MlldWhenExpressionError(
          'Guard env policy fragment must be an object',
          location,
          location?.filePath
            ? { filePath: location.filePath, sourceContent: guardEnv.getSource(location.filePath) }
            : undefined,
          { env: guardEnv }
        );
      }
      policyFragment = normalizePolicyConfig(rawPolicy as PolicyConfig);
    }

    const explicitEnv = (value as Record<string, unknown>).env;
    if (explicitEnv !== undefined) {
      envConfig = explicitEnv;
    } else {
      const { policy: _policy, ...rest } = value as Record<string, unknown>;
      envConfig = Object.keys(rest).length > 0 ? rest : undefined;
    }
  }

  if (envConfig === undefined && !policyFragment) {
    const location = astLocationToSourceLocation(action.location, guardEnv.getCurrentFilePath());
    throw new MlldWhenExpressionError(
      'Guard env actions require either env config or policy fragment',
      location,
      location?.filePath
        ? { filePath: location.filePath, sourceContent: guardEnv.getSource(location.filePath) }
        : undefined,
      { env: guardEnv }
    );
  }

  return {
    ...(envConfig !== undefined ? { envConfig } : {}),
    ...(policyFragment ? { policyFragment } : {})
  };
}

export function buildDecisionMetadata(
  action: GuardActionNode,
  guard: GuardDefinition,
  extras?: BuildDecisionMetadataExtras
): Record<string, unknown> {
  const guardId = guard.name ?? `${guard.filterKind}:${guard.filterValue}`;
  const reason =
    action.message ??
    (action.decision === 'deny'
      ? `Guard ${guardId} denied operation`
      : `Guard ${guardId} requested retry`);

  const metadata: Record<string, unknown> = {
    reason,
    guardName: guard.name ?? null,
    guardFilter: formatGuardFilterForMetadata(guard.filterKind, guard.filterValue),
    scope: guard.scope,
    decision: action.decision,
    guardPrivileged: guard.privileged === true,
    policyGuard: guard.policyCondition !== undefined,
    guardActionMatched: extras?.guardActionMatched ?? true
  };

  if (extras?.hint !== undefined) {
    metadata.hint = extras.hint;
  }

  if (extras?.inputPreview !== undefined) {
    metadata.inputPreview = extras.inputPreview;
  }

  if (extras?.attempt !== undefined) {
    metadata.attempt = extras.attempt;
  }

  if (extras?.tries) {
    metadata.tries = extras.tries.map(entry => ({
      attempt: entry.attempt,
      decision: entry.decision,
      hint: entry.hint ?? null
    }));
  }

  if (extras?.inputVariable) {
    metadata.guardInput = hasSecretLabel(extras.inputVariable)
      ? redactVariableForErrorOutput(extras.inputVariable)
      : extras.inputVariable;
  }

  if (extras?.contextSnapshot) {
    metadata.guardContext = extras.contextSnapshot;
  }

  if (extras?.scopeKey) {
    metadata.guardScopeKey = extras.scopeKey;
  }

  return metadata;
}
