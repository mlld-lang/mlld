import {
  validateNormalizedPolicyAuthorizations,
  validatePolicyAuthorizations,
  type AuthorizationToolContext,
  type PolicyAuthorizationValidationResult
} from '@core/policy/authorizations';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
import { MlldSecurityError } from '@core/errors';
import type { ToolCollection } from '@core/types/tools';
import { isExecutableVariable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function resolvePolicyConfigSource(value: unknown): PolicyConfig | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  if (isPlainObject(value.config)) {
    return value.config as PolicyConfig;
  }
  return value as PolicyConfig;
}

function assertPolicyAuthorizationsShapeValid(candidate: PolicyConfig): void {
  if (candidate.authorizations === undefined) {
    return;
  }

  const validation = validatePolicyAuthorizations(candidate.authorizations);
  if (validation.errors.length === 0) {
    return;
  }

  throw new MlldSecurityError('with { policy } includes invalid policy.authorizations', {
    code: 'POLICY_AUTHORIZATIONS_INVALID',
    details: {
      errors: validation.errors,
      warnings: validation.warnings
    }
  });
}

export async function resolveInvocationPolicyFragment(
  rawPolicy: unknown,
  env: Environment
): Promise<PolicyConfig | undefined> {
  if (rawPolicy === undefined || rawPolicy === null) {
    return undefined;
  }

  let value = rawPolicy;
  if (value && typeof value === 'object' && 'type' in (value as Record<string, unknown>)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    value = result.value;
  }

  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }

  const candidate = resolvePolicyConfigSource(value);
  if (!candidate) {
    throw new MlldSecurityError('with { policy } expects a policy object', {
      code: 'POLICY_FRAGMENT_INVALID',
      details: { policy: value }
    });
  }

  assertPolicyAuthorizationsShapeValid(candidate);

  return normalizePolicyConfig(candidate);
}

export function createInvocationPolicyScope(
  env: Environment,
  policyFragment: PolicyConfig
): { env: Environment; effectivePolicy: PolicyConfig } {
  const effectivePolicy = mergePolicyConfigs(env.getPolicySummary(), policyFragment);
  const child = env.createChild();
  child.setPolicySummary(effectivePolicy);

  const existing = (env.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
  child.setPolicyContext({
    tier: (existing as any).tier ?? null,
    configs: effectivePolicy ?? {},
    activePolicies: Array.isArray((existing as any).activePolicies)
      ? [...(existing as any).activePolicies]
      : [],
    ...((existing as any).environment ? { environment: (existing as any).environment } : {})
  });

  return { env: child, effectivePolicy };
}

export function buildRuntimeAuthorizationToolContext(
  env: Environment
): Map<string, AuthorizationToolContext> {
  const scopedTools = env.getScopedEnvironmentConfig()?.tools;
  if (!scopedTools || !isPlainObject(scopedTools)) {
    return new Map();
  }

  const byExecutable = new Map<string, AuthorizationToolContext>();
  const toolCollection = scopedTools as ToolCollection;

  for (const definition of Object.values(toolCollection)) {
    const execName = typeof definition?.mlld === 'string' ? definition.mlld : '';
    if (!execName) {
      continue;
    }

    const execVar = env.getVariable(execName);
    if (!execVar || !isExecutableVariable(execVar)) {
      continue;
    }

    const existing = byExecutable.get(execName);
    const params = Array.isArray(execVar.paramNames) ? execVar.paramNames : [];
    const controlArgs = Array.isArray(definition.controlArgs) ? definition.controlArgs : undefined;

    if (!existing) {
      byExecutable.set(execName, {
        name: execName,
        params: new Set(params),
        controlArgs: new Set(controlArgs ?? []),
        hasControlArgsMetadata: Array.isArray(definition.controlArgs)
      });
      continue;
    }

    for (const paramName of params) {
      existing.params.add(paramName);
    }
    if (Array.isArray(definition.controlArgs)) {
      existing.hasControlArgsMetadata = true;
      for (const controlArg of definition.controlArgs) {
        existing.controlArgs.add(controlArg);
      }
    }
  }

  return byExecutable;
}

export function validateRuntimePolicyAuthorizations(
  policy: PolicyConfig | undefined,
  env: Environment
): PolicyAuthorizationValidationResult | undefined {
  if (!policy?.authorizations) {
    return undefined;
  }

  const toolContext = buildRuntimeAuthorizationToolContext(env);
  return validateNormalizedPolicyAuthorizations(policy.authorizations, toolContext, {
    requireKnownTools: true,
    requireControlArgsMetadata: true
  });
}

export function createPolicyAuthorizationValidationError(
  validation: PolicyAuthorizationValidationResult,
  fallbackMessage = 'policy.authorizations validation failed'
): MlldSecurityError {
  const primaryMessage = validation.errors[0]?.message;
  return new MlldSecurityError(primaryMessage ?? fallbackMessage, {
    code: 'POLICY_AUTHORIZATIONS_INVALID',
    details: {
      errors: validation.errors,
      warnings: validation.warnings
    }
  });
}
