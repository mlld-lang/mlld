import {
  mergePolicyAuthorizations,
  normalizePolicyAuthorizations,
  stripPolicyAuthorizableField,
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
  materializePolicySourceValue,
  type PolicyAuthorizationCompileReport
} from '@interpreter/policy/authorization-compiler';
import { boundary } from '@interpreter/utils/boundary';
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

function sanitizeRuntimePolicyCandidate(candidate: PolicyConfig): PolicyConfig {
  const { authorizable: _, ...rest } = candidate;
  const strippedAuthorizations = stripPolicyAuthorizableField(rest.authorizations);
  const hasAuthorizations =
    isPlainObject(strippedAuthorizations)
      ? Object.keys(strippedAuthorizations).length > 0
      : strippedAuthorizations !== undefined;
  return {
    ...rest,
    ...(hasAuthorizations
      ? { authorizations: strippedAuthorizations as PolicyConfig['authorizations'] }
      : {})
  };
}

function resolvePolicyConfigSources(value: unknown): PolicyConfig[] | undefined {
  if (Array.isArray(value)) {
    const candidates: PolicyConfig[] = [];
    for (const entry of value) {
      const candidate = resolvePolicyConfigSource(entry);
      if (!candidate) {
        return undefined;
      }
      candidates.push(candidate);
    }
    return candidates;
  }

  const candidate = resolvePolicyConfigSource(value);
  return candidate ? [candidate] : undefined;
}

function mergeCompileReports(
  base: PolicyAuthorizationCompileReport,
  incoming: PolicyAuthorizationCompileReport
): PolicyAuthorizationCompileReport {
  return {
    strippedArgs: [...base.strippedArgs, ...incoming.strippedArgs],
    repairedArgs: [...base.repairedArgs, ...incoming.repairedArgs],
    droppedEntries: [...base.droppedEntries, ...incoming.droppedEntries],
    droppedArrayElements: [...base.droppedArrayElements, ...incoming.droppedArrayElements],
    ambiguousValues: [...base.ambiguousValues, ...incoming.ambiguousValues],
    compiledProofs: [...base.compiledProofs, ...incoming.compiledProofs]
  };
}

const policyAuthorizationCompileReports = new WeakMap<PolicyConfig, PolicyAuthorizationCompileReport>();

async function resolveInvocationPolicyOptionValue(
  rawValue: unknown,
  env: Environment
): Promise<unknown> {
  let value = await boundary.config(rawValue, env);
  value = await resolveValueHandles(value, env);
  return value;
}

function reattachRawAuthorizations(
  candidates: PolicyConfig[],
  rawSources: PolicyConfig[] | undefined
): PolicyConfig[] {
  if (!rawSources || rawSources.length !== candidates.length) {
    return candidates;
  }

  return candidates.map((candidate, index) => {
    const rawSource = rawSources[index];
    if (!rawSource || rawSource.authorizations === undefined) {
      return candidate;
    }
    return {
      ...candidate,
      authorizations: rawSource.authorizations
    };
  });
}

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
  env: Environment,
  options: { replace?: boolean } = {}
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
  value = await boundary.config(value, env);
  value = await resolveValueHandles(value, env);

  const candidates = resolvePolicyConfigSources(value);
  if (!candidates || candidates.length === 0) {
    throw new MlldSecurityError('with { policy } expects a policy object', {
      code: 'POLICY_FRAGMENT_INVALID',
      details: { policy: value }
    });
  }
  const rawPolicySource = await materializePolicySourceValue(rawResolvedValue, env);
  const policySources = resolvePolicyConfigSources(rawPolicySource);
  const compiledCandidates = reattachRawAuthorizations(candidates, policySources).map(
    sanitizeRuntimePolicyCandidate
  );

  const normalized = compiledCandidates.reduce<PolicyConfig | undefined>(
    (merged, candidate) => mergePolicyConfigs(merged, normalizePolicyConfig(candidate)),
    undefined
  ) ?? {};

  let combinedCompileReport: PolicyAuthorizationCompileReport | undefined;
  let compiledAuthorizations = normalized.authorizations;
  const rawAuthorizationCandidates =
    compiledCandidates.filter(candidate => candidate.authorizations !== undefined);
  if (rawAuthorizationCandidates.length > 0) {
    const toolContext = buildRuntimeAuthorizationToolContext(env);
    compiledAuthorizations = undefined;

    for (const candidate of rawAuthorizationCandidates) {
      const compilation = await compilePolicyAuthorizations({
        rawAuthorizations: candidate.authorizations,
        rawSource: rawResolvedValue,
        env,
        toolContext,
        policy: options.replace ? normalized : mergePolicyConfigs(env.getPolicySummary(), normalized),
        ambientDeniedTools: options.replace ? undefined : env.getPolicySummary()?.authorizations?.deny,
        mode: 'runtime'
      });

      if (compilation.authorizations) {
        compiledAuthorizations = mergePolicyAuthorizations(
          compiledAuthorizations,
          compilation.authorizations
        );
      }
      combinedCompileReport = combinedCompileReport
        ? mergeCompileReports(combinedCompileReport, compilation.report)
        : clonePolicyAuthorizationCompileReport(compilation.report);
    }
  }

  if (compiledAuthorizations !== undefined) {
    normalized.authorizations = compiledAuthorizations;
  }

  if (combinedCompileReport && hasPolicyAuthorizationCompileActivity(combinedCompileReport)) {
      policyAuthorizationCompileReports.set(
        normalized,
        clonePolicyAuthorizationCompileReport(combinedCompileReport)
      );
  }

  return normalized;
}

export async function resolveInvocationPolicyReplaceFlag(
  rawReplace: unknown,
  env: Environment
): Promise<boolean> {
  if (rawReplace === undefined || rawReplace === null) {
    return false;
  }

  const value = await resolveInvocationPolicyOptionValue(rawReplace, env);
  if (typeof value !== 'boolean') {
    throw new MlldSecurityError('with { replace } must be a boolean', {
      code: 'POLICY_FRAGMENT_INVALID',
      details: { replace: value }
    });
  }

  return value;
}

export function createInvocationPolicyScope(
  env: Environment,
  policyFragment: PolicyConfig,
  options: { replace?: boolean } = {}
): { env: Environment; effectivePolicy: PolicyConfig } {
  const effectivePolicy = options.replace ? policyFragment : mergePolicyConfigs(env.getPolicySummary(), policyFragment);
  const child = env.createChild();
  child.setPolicySummary(effectivePolicy);

  const existing = (env.getPolicyContext() as Record<string, unknown> | undefined) ?? {};
  const compileReport = getInvocationPolicyFragmentCompileReport(policyFragment);
  child.setPolicyContext({
    tier: (existing as any).tier ?? null,
    configs: effectivePolicy ?? {},
    activePolicies: options.replace
      ? []
      : Array.isArray((existing as any).activePolicies)
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
