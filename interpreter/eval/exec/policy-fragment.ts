import {
  normalizePolicyAuthorizations,
  validateNormalizedPolicyAuthorizations,
  type PolicyAuthorizationValidationResult
} from '@core/policy/authorizations';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
import { MlldSecurityError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import {
  clonePolicyAuthorizationCompileReport,
  compilePolicyAuthorizations,
  hasPolicyAuthorizationCompileActivity,
  type PolicyAuthorizationCompileReport
} from '@interpreter/policy/authorization-compiler';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { buildRuntimeAuthorizationToolContext } from './tool-metadata';

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

const policyAuthorizationCompileReports = new WeakMap<PolicyConfig, PolicyAuthorizationCompileReport>();

export function getInvocationPolicyFragmentCompileReport(
  policy: PolicyConfig | undefined
): PolicyAuthorizationCompileReport | undefined {
  if (!policy) {
    return undefined;
  }
  const report = policyAuthorizationCompileReports.get(policy);
  return report ? clonePolicyAuthorizationCompileReport(report) : undefined;
}

export async function resolveInvocationPolicyFragment(
  rawPolicy: unknown,
  env: Environment
): Promise<PolicyConfig | undefined> {
  if (rawPolicy === undefined || rawPolicy === null) {
    return undefined;
  }

  let value = rawPolicy;
  let attestationSource = rawPolicy;
  let attestationSourceLocked = false;
  if (value && typeof value === 'object' && 'type' in (value as Record<string, unknown>)) {
    const candidate = value as Record<string, unknown>;
    if (candidate.type === 'VariableReference' && typeof candidate.identifier === 'string') {
      const referenced = env.getVariable(candidate.identifier);
      if (referenced) {
        attestationSource = referenced.value;
        attestationSourceLocked = true;
      }
    }
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    value = result.value;
    if (!attestationSourceLocked && attestationSource === rawPolicy) {
      attestationSource = value;
    }
  }

  if (isVariable(value)) {
    attestationSource = value.value;
    attestationSourceLocked = true;
    value = await extractVariableValue(value, env);
  } else if (!attestationSourceLocked) {
    attestationSource = value;
  }
  const rawResolvedValue = attestationSource;
  value = await resolveValueHandles(value, env);
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

  const normalized = normalizePolicyConfig(candidate);
  if (candidate.authorizations !== undefined) {
    const toolContext = buildRuntimeAuthorizationToolContext(env);
    const compilation = await compilePolicyAuthorizations({
      rawAuthorizations: candidate.authorizations,
      rawSource: rawResolvedValue,
      env,
      toolContext,
      policy: mergePolicyConfigs(env.getPolicySummary(), candidate),
      ambientDeniedTools: env.getPolicySummary()?.authorizations?.deny,
      mode: 'runtime'
    });

    if (compilation.authorizations) {
      normalized.authorizations = compilation.authorizations;
    }
    if (hasPolicyAuthorizationCompileActivity(compilation.report)) {
      policyAuthorizationCompileReports.set(
        normalized,
        clonePolicyAuthorizationCompileReport(compilation.report)
      );
    }
  }

  return normalized;
}

export function createInvocationPolicyScope(
  env: Environment,
  policyFragment: PolicyConfig
): { env: Environment; effectivePolicy: PolicyConfig } {
  const effectivePolicy = mergePolicyConfigs(env.getPolicySummary(), policyFragment);
  const child = env.createChild();
  child.setPolicySummary(effectivePolicy);

  const existing = (env.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
  const compileReport = getInvocationPolicyFragmentCompileReport(policyFragment);
  child.setPolicyContext({
    tier: (existing as any).tier ?? null,
    configs: effectivePolicy ?? {},
    activePolicies: Array.isArray((existing as any).activePolicies)
      ? [...(existing as any).activePolicies]
      : [],
    ...(compileReport ? { authorizationsCompile: compileReport } : {}),
    ...((existing as any).environment ? { environment: (existing as any).environment } : {})
  });

  return { env: child, effectivePolicy };
}

export function validateRuntimePolicyAuthorizations(
  policy: PolicyConfig | undefined,
  env: Environment
): PolicyAuthorizationValidationResult | undefined {
  if (!policy?.authorizations) {
    return undefined;
  }

  const toolContext = buildRuntimeAuthorizationToolContext(env);
  const normalizedAuthorizations = normalizePolicyAuthorizations(
    policy.authorizations,
    undefined,
    toolContext
  );
  if (normalizedAuthorizations) {
    policy.authorizations = normalizedAuthorizations;
  }
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
