import {
  validateNormalizedPolicyAuthorizations,
  validatePolicyAuthorizations,
  type PolicyAuthorizationValidationResult
} from '@core/policy/authorizations';
import { mergePolicyConfigs, normalizePolicyConfig, type PolicyConfig } from '@core/policy/union';
import { MlldSecurityError } from '@core/errors';
import { isAttestationLabel } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import {
  asData,
  extractSecurityDescriptor,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
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

function normalizeAttestationLabels(labels: readonly string[] | undefined): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }
  return Array.from(
    new Set(
      labels.filter((entry): entry is string => typeof entry === 'string' && isAttestationLabel(entry))
    )
  );
}

function isAstObjectNode(value: unknown): value is {
  type: 'object';
  entries?: Array<{ key?: string; value?: unknown }>;
} {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'object'
      && Array.isArray((value as { entries?: unknown }).entries)
  );
}

function isAstArrayNode(value: unknown): value is {
  type: 'array';
  items?: unknown[];
} {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'array'
      && Array.isArray((value as { items?: unknown }).items)
  );
}

function getAstObjectEntryValue(node: unknown, key: string): unknown {
  if (!isAstObjectNode(node)) {
    return undefined;
  }
  return node.entries?.find(entry => entry?.key === key)?.value;
}

async function unwrapResolvedConstraintValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(value)) {
    if (extractSecurityDescriptor(value)) {
      return value;
    }
    const extracted = await extractVariableValue(value, env);
    return unwrapResolvedConstraintValue(extracted, env);
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      items.push(await unwrapResolvedConstraintValue(item, env));
    }
    return items;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await unwrapResolvedConstraintValue(entry, env);
    }
    return result;
  }
  return value;
}

async function materializePolicySourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (isVariable(value)) {
    if (extractSecurityDescriptor(value)) {
      return value;
    }
    const extracted = await extractVariableValue(value, env);
    return materializePolicySourceValue(extracted, env);
  }

  if (isStructuredValue(value)) {
    if (value.type === 'array' && Array.isArray(value.data)) {
      const items: unknown[] = [];
      for (const item of value.data) {
        items.push(await materializePolicySourceValue(item, env));
      }
      return items;
    }
    if (value.type === 'object' && isPlainObject(value.data)) {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value.data)) {
        result[key] = await materializePolicySourceValue(entry, env);
      }
      return result;
    }
    return value;
  }

  if (Array.isArray(value)) {
    const items: unknown[] = [];
    for (const item of value) {
      items.push(await materializePolicySourceValue(item, env));
    }
    return items;
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await materializePolicySourceValue(entry, env);
    }
    return result;
  }

  return value;
}

async function resolveConstraintSourceValue(
  value: unknown,
  env: Environment
): Promise<unknown> {
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (candidate.type === 'VariableReference' && typeof candidate.identifier === 'string') {
      const variable = env.getVariable(candidate.identifier);
      if (!variable) {
        return candidate;
      }
      const resolved = await resolveValueHandles(variable, env);
      return unwrapResolvedConstraintValue(resolved, env);
    }
    if (isAstArrayNode(value)) {
      const items: unknown[] = [];
      for (const item of value.items ?? []) {
        items.push(await resolveConstraintSourceValue(item, env));
      }
      return items;
    }
    if (isAstObjectNode(value)) {
      const result: Record<string, unknown> = {};
      for (const entry of value.entries ?? []) {
        if (typeof entry?.key !== 'string') {
          continue;
        }
        result[entry.key] = await resolveConstraintSourceValue(entry.value, env);
      }
      return result;
    }
  }
  if (
    value &&
    typeof value === 'object' &&
    'type' in (value as Record<string, unknown>) &&
    !isStructuredValue(value)
  ) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    const resolved = await resolveValueHandles(result.value, env);
    return unwrapResolvedConstraintValue(resolved, env);
  }
  const resolved = await resolveValueHandles(value, env);
  return unwrapResolvedConstraintValue(resolved, env);
}

async function extractConstraintAttestations(
  value: unknown,
  env: Environment
): Promise<string[]> {
  const resolvedValue = await resolveConstraintSourceValue(value, env);
  const descriptor = extractSecurityDescriptor(resolvedValue, {
    recursive: true,
    mergeArrayElements: true
  });
  return normalizeAttestationLabels(descriptor?.attestations ?? descriptor?.labels);
}

async function compileAuthorizationAttestations(
  rawPolicy: unknown,
  normalizedPolicy: PolicyConfig | undefined,
  env: Environment
): Promise<void> {
  const rawValue = isStructuredValue(rawPolicy) ? asData(rawPolicy) : rawPolicy;
  const normalizedAuthorizations = normalizedPolicy?.authorizations;
  const sourceValue =
    isAstObjectNode(rawValue) || isAstArrayNode(rawValue)
      ? rawValue
      : await materializePolicySourceValue(rawValue, env);
  let rawConfig = resolvePolicyConfigSource(sourceValue);
  let rawAuthorizationsNode = getAstObjectEntryValue(sourceValue, 'authorizations');
  let rawAuthorizations =
    rawConfig && isPlainObject(rawConfig.authorizations)
      ? (rawConfig.authorizations as Record<string, unknown>)
      : undefined;
  let rawAllow =
    rawAuthorizations && isPlainObject(rawAuthorizations.allow)
      ? (rawAuthorizations.allow as Record<string, unknown>)
      : undefined;

  if (!normalizedAuthorizations || (!rawAllow && !rawAuthorizationsNode)) {
    return;
  }

  for (const [toolName, entry] of Object.entries(normalizedAuthorizations.allow)) {
    if (entry.kind !== 'constrained') {
      continue;
    }
    const rawEntry = rawAllow?.[toolName];
    const rawArgsObject =
      isPlainObject(rawEntry) && isPlainObject(rawEntry.args)
        ? (rawEntry.args as Record<string, unknown>)
        : undefined;
    const rawArgsNode = getAstObjectEntryValue(
      getAstObjectEntryValue(
        getAstObjectEntryValue(rawAuthorizationsNode, 'allow'),
        toolName
      ),
      'args'
    );
    if (!rawArgsObject && !rawArgsNode) {
      continue;
    }

    for (const [argName, clauses] of Object.entries(entry.args)) {
      const rawConstraint = rawArgsObject?.[argName] ?? getAstObjectEntryValue(rawArgsNode, argName);
      if (rawConstraint === undefined) {
        continue;
      }

      entry.args[argName] = await Promise.all(clauses.map(async clause => {
        if ('eq' in clause) {
          let compiledAttestations = await extractConstraintAttestations(
            isPlainObject(rawConstraint) && Object.prototype.hasOwnProperty.call(rawConstraint, 'eq')
              ? rawConstraint.eq
              : getAstObjectEntryValue(rawConstraint, 'eq') ?? rawConstraint,
            env
          );
          if (compiledAttestations.length === 0) {
            compiledAttestations = await extractConstraintAttestations(clause.eq, env);
          }
          if (compiledAttestations.length === 0) {
            return clause;
          }
          return {
            ...clause,
            attestations: compiledAttestations
          };
        }

        const rawOneOfCandidates =
          isPlainObject(rawConstraint) && Array.isArray(rawConstraint.oneOf)
            ? rawConstraint.oneOf
            : isAstArrayNode(getAstObjectEntryValue(rawConstraint, 'oneOf'))
              ? (getAstObjectEntryValue(rawConstraint, 'oneOf') as { items: unknown[] }).items
              : clause.oneOf;
        let oneOfAttestations = await Promise.all(
          rawOneOfCandidates.map(candidate => extractConstraintAttestations(candidate, env))
        );
        if (!oneOfAttestations.some(entry => entry.length > 0)) {
          oneOfAttestations = await Promise.all(
            clause.oneOf.map(candidate => extractConstraintAttestations(candidate, env))
          );
        }
        if (!oneOfAttestations.some(entry => entry.length > 0)) {
          return clause;
        }
        return {
          ...clause,
          oneOfAttestations
        };
      }));
    }
  }
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

  assertPolicyAuthorizationsShapeValid(candidate);

  const normalized = normalizePolicyConfig(candidate);
  await compileAuthorizationAttestations(rawResolvedValue, normalized, env);
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
