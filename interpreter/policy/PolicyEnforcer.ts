import type { PolicyConfig } from '@core/policy/union';
import { shouldAddInfluencedLabel } from '@core/policy/builtin-rules';
import type { SourceLocation } from '@core/types';
import { MlldDenialError, type DenialContext } from '@core/errors/denial';
import { checkLabelFlow, type FlowContext } from '@core/policy/label-flow';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { OperationContext } from '@interpreter/env/ContextManager';

export class PolicyEnforcer {
  private readonly policy?: PolicyConfig;

  constructor(policy?: PolicyConfig) {
    this.policy = policy;
  }

  checkLabelFlow(
    ctx: FlowContext,
    options?: { env?: Environment; sourceLocation?: SourceLocation }
  ): void {
    if (!this.policy) {
      return;
    }

    const result = checkLabelFlow(ctx, this.policy);
    if (result.allowed) {
      return;
    }

    const denialContext = buildLabelFlowDenialContext(ctx, result, options?.env);
    throw new MlldDenialError(denialContext, {
      sourceLocation: options?.sourceLocation,
      env: options?.env
    });
  }

  applyOutputPolicyLabels(
    descriptor: SecurityDescriptor | undefined,
    ctx: { inputTaint: readonly string[]; exeLabels: readonly string[] }
  ): SecurityDescriptor | undefined {
    if (!this.policy) {
      return descriptor;
    }
    const baseDescriptor = this.applyDefaultTrustLabel(descriptor);
    if (!shouldAddInfluencedLabel(this.policy, ctx.inputTaint, ctx.exeLabels)) {
      return baseDescriptor;
    }
    const influencedDescriptor = makeSecurityDescriptor({ labels: ['influenced'] });
    return baseDescriptor
      ? mergeDescriptors(baseDescriptor, influencedDescriptor)
      : influencedDescriptor;
  }

  applyDefaultTrustLabel(descriptor: SecurityDescriptor | undefined): SecurityDescriptor | undefined {
    if (!this.policy) {
      return descriptor;
    }
    const defaultTrust = this.policy.defaults?.unlabeled;
    if (!defaultTrust || !descriptor) {
      return descriptor;
    }
    const labels = Array.isArray(descriptor.labels) ? descriptor.labels : [];
    const taint = Array.isArray(descriptor.taint) ? descriptor.taint : [];
    const sources = Array.isArray(descriptor.sources) ? descriptor.sources : [];
    if (labels.length === 0 && taint.length === 0 && sources.length === 0) {
      return descriptor;
    }
    const hasUserLabel = [...labels, ...taint].some(label => {
      if (label.startsWith('src:') || label.startsWith('dir:')) {
        return false;
      }
      if (label === defaultTrust) {
        return false;
      }
      return true;
    });
    if (hasUserLabel) {
      return descriptor;
    }
    if (labels.includes(defaultTrust) || taint.includes(defaultTrust)) {
      return descriptor;
    }
    const trustDescriptor = makeSecurityDescriptor({ labels: [defaultTrust] });
    return mergeDescriptors(descriptor, trustDescriptor);
  }
}

function buildLabelFlowDenialContext(
  ctx: FlowContext,
  result: ReturnType<typeof checkLabelFlow>,
  env?: Environment
): DenialContext {
  const opContext = env?.getSecuritySnapshot?.()?.operation as OperationContext | undefined;
  const operationType = opContext?.type ?? 'operation';
  const operationDescription =
    opContext?.command ??
    opContext?.target ??
    opContext?.name ??
    ctx.command ??
    '';
  const policyContext = env?.getPolicyContext?.() as any;
  const activePolicies = Array.isArray(policyContext?.activePolicies)
    ? policyContext.activePolicies.filter((entry: unknown) => typeof entry === 'string')
    : [];
  const policyName = activePolicies.length > 0 ? activePolicies.join(', ') : 'policy';
  const inputLabels = toUniqueList(ctx.inputTaint);
  const operationLabels = toUniqueList([...(ctx.opLabels ?? []), ...(ctx.exeLabels ?? [])]);

  return {
    code: 'POLICY_LABEL_FLOW_DENIED',
    operation: {
      type: operationType,
      description: operationDescription
    },
    blocker: {
      type: 'policy',
      name: policyName,
      ...(result.rule ? { rule: result.rule } : {})
    },
    labels: {
      input: inputLabels,
      operation: operationLabels
    },
    reason: result.reason ?? 'Label flow denied by policy',
    suggestions: buildLabelFlowSuggestions(result.label)
  };
}

function toUniqueList(values: readonly string[] | string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const entry = String(value).trim();
    if (!entry || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    normalized.push(entry);
  }
  return normalized;
}

function buildLabelFlowSuggestions(label?: string): string[] {
  const suggestions: string[] = [];
  if (label) {
    if (!label.startsWith('src:')) {
      if (label === 'untrusted') {
        suggestions.push(`Remove '${label}' label if data has been validated`);
      } else if (label === 'secret' || label === 'sensitive' || label === 'pii') {
        suggestions.push(`Remove '${label}' label if data is not sensitive`);
      } else {
        suggestions.push(`Remove '${label}' label if this classification no longer applies`);
      }
    }
    suggestions.push(`Review policy.labels["${label}"] allow/deny rules`);
    if (label === 'secret') {
      suggestions.push('Use using auth:name or using @var as ENV_NAME for credential flow');
    }
    return suggestions;
  }
  suggestions.push('Review policy label rules');
  return suggestions;
}
