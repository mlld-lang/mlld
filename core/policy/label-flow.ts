import {
  getPolicyDefaultRuleOptions,
  listPolicyDefaultRuleNames,
  resolvePolicyDefaultRuleOptions,
  type PolicyConfig,
  type PolicyLabels,
  type PolicyOperations
} from './union';
import { isBuiltinPolicyRuleName } from './builtin-rules';
import { resolveInputTaint } from './input-taint';
import { isAttestationLabel } from '@core/types/security';
import {
  getLabelPatternSpecificity,
  matchesFactPattern,
  matchesLabelPattern
} from './fact-labels';
import {
  DECLARED_CONTROL_ARG_KNOWN_PATTERNS,
  SEND_KNOWN_PATTERNS,
  SEND_INTERNAL_PATTERNS,
  TARGET_KNOWN_PATTERNS
} from './fact-requirements';

export type FlowChannel = 'arg' | 'stdin' | 'using';

export interface FlowInputDescriptor {
  labels?: readonly string[];
  taint?: readonly string[];
  attestations?: readonly string[];
  sources?: readonly string[];
}

export interface FlowContext {
  inputTaint: readonly string[];
  opLabels: readonly string[];
  exeLabels: readonly string[];
  flowChannel?: FlowChannel;
  command?: string;
  inputs?: readonly FlowInputDescriptor[];
  inputNames?: readonly (string | null | undefined)[];
  controlArgs?: readonly string[];
  hasControlArgsMetadata?: boolean;
  sourceArgs?: readonly string[];
  hasSourceArgsMetadata?: boolean;
  taintFacts?: boolean;
}

export interface LabelFlowCheckResult {
  allowed: boolean;
  reason?: string;
  rule?: string;
  label?: string;
  matched?: string;
}

type MatchResult = { match: string; specificity: number };

const LABEL_FLOW_BUILTIN_RULES = new Set([
  'no-secret-exfil',
  'no-sensitive-exfil',
  'no-send-to-unknown',
  'no-send-to-external',
  'no-destroy-unknown',
  'no-unknown-extraction-sources',
  'no-untrusted-destructive',
  'no-untrusted-privileged',
  'no-influenced-advice'
]);

function normalizeList(values?: readonly string[]): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const entry = String(value).trim();
    if (!entry || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function ruleSpecificity(rule: string): number {
  return getLabelPatternSpecificity(rule);
}

function findBestMatch(
  targets: readonly string[],
  rules: readonly string[]
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const target of targets) {
    for (const rule of rules) {
      if (!matchesLabelPattern(rule, target)) {
        continue;
      }
      const specificity = ruleSpecificity(rule);
      if (!best || specificity > best.specificity) {
        best = { match: rule, specificity };
      }
    }
  }
  return best;
}

export function expandOperationLabels(
  targets: readonly string[],
  mappings?: PolicyOperations
): string[] {
  if (!mappings) {
    return [...targets];
  }
  const expanded = new Set(targets);
  for (const target of targets) {
    for (const [riskCategory, semanticLabels] of Object.entries(mappings)) {
      const labels = normalizeList(semanticLabels);
      const matches = labels.some(label => matchesLabelPattern(label, target));
      if (matches) {
        expanded.add(riskCategory);
      }
    }
  }
  return Array.from(expanded);
}

function findBestPolicyLabelRule(
  label: string,
  rules: PolicyLabels
): { key: string; rule: NonNullable<PolicyLabels[string]> } | null {
  let bestKey: string | null = null;
  let bestRule: NonNullable<PolicyLabels[string]> | null = null;
  let bestSpecificity = -1;

  for (const [ruleKey, rule] of Object.entries(rules)) {
    if (!rule) {
      continue;
    }

    const matches = ruleKey.startsWith('fact:')
      ? matchesFactPattern(ruleKey, label)
      : ruleKey === label;
    if (!matches) {
      continue;
    }

    const specificity = ruleSpecificity(ruleKey);
    if (!bestRule || specificity > bestSpecificity) {
      bestKey = ruleKey;
      bestRule = rule;
      bestSpecificity = specificity;
    }
  }

  if (!bestKey || !bestRule) {
    return null;
  }

  return { key: bestKey, rule: bestRule };
}

export function hasManagedPolicyLabelFlow(policy?: PolicyConfig): boolean {
  if (!policy) {
    return false;
  }
  if (policy.labels && Object.keys(policy.labels).length > 0) {
    return true;
  }
  return listPolicyDefaultRuleNames(policy.defaults?.rules).some(rule => LABEL_FLOW_BUILTIN_RULES.has(rule));
}

export function checkExplicitLabelFlowRules(
  ctx: FlowContext,
  policy?: PolicyConfig
): LabelFlowCheckResult {
  if (!policy) {
    return { allowed: true };
  }

  const resolvedInput = resolveInputTaint(ctx.inputTaint, policy);
  const inputTaint = resolvedInput.effective;
  if (inputTaint.length === 0) {
    return { allowed: true };
  }

  const rawOpTargets = normalizeList([
    ...(ctx.opLabels ?? []),
    ...(ctx.exeLabels ?? [])
  ]);
  if (rawOpTargets.length === 0) {
    return { allowed: true };
  }

  const opTargets = expandOperationLabels(rawOpTargets, policy.operations);
  const labelRules: PolicyLabels = policy.labels ?? {};

  for (const label of inputTaint) {
    const matchedRule = findBestPolicyLabelRule(label, labelRules);
    if (!matchedRule) {
      continue;
    }
    const rule = matchedRule.rule;
    const denyRules = normalizeList(rule.deny);
    const allowRules = normalizeList(rule.allow);
    const denyMatch = denyRules.length > 0 ? findBestMatch(opTargets, denyRules) : null;
    const allowMatch = allowRules.length > 0 ? findBestMatch(opTargets, allowRules) : null;

    if (denyMatch) {
      if (allowMatch && allowMatch.specificity > denyMatch.specificity) {
        continue;
      }
      return {
        allowed: false,
        reason: `Label '${label}' cannot flow to '${denyMatch.match}'`,
        rule: `policy.labels.${matchedRule.key}.deny`,
        label,
        matched: denyMatch.match
      };
    }
  }

  if (resolvedInput.applyUntrustedDefault) {
    for (const label of resolvedInput.raw) {
      const matchedRule = findBestPolicyLabelRule(label, labelRules);
      const allowRules = normalizeList(matchedRule?.rule.allow);
      if (allowRules.length === 0) {
        continue;
      }
      const allowMatch = findBestMatch(opTargets, allowRules);
      if (!allowMatch) {
        return {
          allowed: false,
          reason: `Label '${label}' is not explicitly allowed for this operation`,
          rule: `policy.labels.${matchedRule?.key ?? label}.allow`,
          label
        };
      }
    }
  }

  return { allowed: true };
}

export function checkLabelFlow(
  ctx: FlowContext,
  policy?: PolicyConfig
): LabelFlowCheckResult {
  if (!policy) {
    return { allowed: true };
  }

  const resolvedInput = resolveInputTaint(ctx.inputTaint, policy);
  const inputTaint = resolvedInput.effective;
  const rawOpTargets = normalizeList([
    ...(ctx.opLabels ?? []),
    ...(ctx.exeLabels ?? [])
  ]);
  if (rawOpTargets.length === 0) {
    return { allowed: true };
  }

  const enabledRules = resolvePolicyDefaultRuleOptions(policy.defaults?.rules).filter(entry =>
    isBuiltinPolicyRuleName(entry.rule)
  );
  const requiresPrimaryInputCheck = enabledRules.some(rule =>
    rule.rule === 'no-send-to-unknown' ||
    rule.rule === 'no-send-to-external' ||
    rule.rule === 'no-destroy-unknown' ||
    rule.rule === 'no-unknown-extraction-sources'
  );
  if (inputTaint.length === 0 && !requiresPrimaryInputCheck) {
    return { allowed: true };
  }

  const opTargets = expandOperationLabels(rawOpTargets, policy.operations);
  const builtInResult = checkBuiltinPolicyRules(ctx, inputTaint, opTargets, enabledRules, policy);
  if (builtInResult) {
    return builtInResult;
  }

  if (inputTaint.length === 0) {
    return { allowed: true };
  }

  return checkExplicitLabelFlowRules(ctx, policy);
}

function hasTargetLabel(targets: readonly string[], label: string): boolean {
  return Boolean(findBestMatch(targets, [label]));
}

function hasAnyTargetLabel(targets: readonly string[], labels: readonly string[]): boolean {
  return labels.some(label => hasTargetLabel(targets, label));
}

function collectInputAttestations(input?: FlowInputDescriptor): string[] {
  return normalizeList([
    ...(input?.attestations ?? []),
    ...(input?.labels ?? []),
    ...(input?.taint ?? []),
    ...((input?.labels ?? []).filter(isAttestationLabel))
  ]);
}

function collectInputTaintLabels(input?: FlowInputDescriptor): string[] {
  return normalizeList([
    ...(input?.labels ?? []).filter(label => !isAttestationLabel(label)),
    ...(input?.taint ?? [])
  ]);
}

function collectDeclaredArgAttestations(
  ctx: FlowContext,
  argNames: readonly string[]
): Map<string, string[]> | null {
  if (!Array.isArray(ctx.inputs) || !Array.isArray(ctx.inputNames)) {
    return null;
  }

  const normalizedArgs = normalizeList(argNames);
  const requested = new Set(normalizedArgs);
  const collected = new Map<string, string[]>();
  const limit = Math.min(ctx.inputs.length, ctx.inputNames.length);
  for (let index = 0; index < limit; index += 1) {
    const inputName = ctx.inputNames[index];
    if (typeof inputName !== 'string' || !requested.has(inputName)) {
      continue;
    }
    collected.set(inputName, collectInputAttestations(ctx.inputs[index]));
  }

  return collected;
}

function getScopedTaintInputLabels(
  ctx: FlowContext,
  inputTaint: readonly string[],
  ruleName: 'no-untrusted-destructive' | 'no-untrusted-privileged',
  policy?: PolicyConfig
): string[] {
  const policyRuleTaintFacts =
    getPolicyDefaultRuleOptions(policy?.defaults?.rules, ruleName)?.taintFacts === true;
  if (ctx.taintFacts === true || policyRuleTaintFacts) {
    return normalizeList([...inputTaint]);
  }

  if (ctx.hasControlArgsMetadata !== true) {
    return normalizeList([...inputTaint]);
  }

  const controlArgs = normalizeList(ctx.controlArgs);
  if (controlArgs.length === 0) {
    return normalizeList([...inputTaint]);
  }

  if (!Array.isArray(ctx.inputs) || !Array.isArray(ctx.inputNames)) {
    return [];
  }

  const scoped = new Set<string>();
  const limit = Math.min(ctx.inputs.length, ctx.inputNames.length);
  for (let index = 0; index < limit; index += 1) {
    const inputName = ctx.inputNames[index];
    if (typeof inputName !== 'string' || !controlArgs.includes(inputName)) {
      continue;
    }
    for (const label of collectInputTaintLabels(ctx.inputs[index])) {
      scoped.add(label);
    }
  }

  return Array.from(scoped);
}

function checkBuiltinPolicyRules(
  ctx: FlowContext,
  inputTaint: readonly string[],
  opTargets: readonly string[],
  rules: ReadonlyArray<{ rule: string; taintFacts?: boolean }>,
  policy?: PolicyConfig
): LabelFlowCheckResult | null {
  const enabledRules = rules.filter(rule => isBuiltinPolicyRuleName(rule.rule));
  if (enabledRules.length === 0) {
    return null;
  }

  const hasSecret = inputTaint.includes('secret');
  const hasSensitive = inputTaint.includes('sensitive');
  const hasInfluenced = inputTaint.includes('influenced');
  const hasExfil = hasTargetLabel(opTargets, 'exfil');
  const hasSend = hasTargetLabel(opTargets, 'exfil:send');
  const hasDestructive = hasTargetLabel(opTargets, 'destructive');
  const hasAdvice = hasTargetLabel(opTargets, 'advice');
  const hasTargetedDestructive = hasTargetLabel(opTargets, 'destructive:targeted');
  const hasPrivileged = hasTargetLabel(opTargets, 'privileged');
  const destructiveInputTaint = getScopedTaintInputLabels(
    ctx,
    inputTaint,
    'no-untrusted-destructive',
    policy
  );
  const privilegedInputTaint = getScopedTaintInputLabels(
    ctx,
    inputTaint,
    'no-untrusted-privileged',
    policy
  );
  const hasUntrustedDestructiveInput = destructiveInputTaint.includes('untrusted');
  const hasUntrustedPrivilegedInput = privilegedInputTaint.includes('untrusted');
  const primaryInput = ctx.inputs?.[0];
  const primaryInputAttestations = collectInputAttestations(primaryInput);
  const primaryInputKnown = hasAnyTargetLabel(primaryInputAttestations, SEND_KNOWN_PATTERNS);
  const primaryInputKnownInternal = hasAnyTargetLabel(primaryInputAttestations, SEND_INTERNAL_PATTERNS);
  const primaryInputKnownTarget = hasAnyTargetLabel(primaryInputAttestations, TARGET_KNOWN_PATTERNS);
  const sourceArgs = normalizeList(ctx.sourceArgs);
  const sourceArgAttestations = collectDeclaredArgAttestations(ctx, sourceArgs);

  for (const rule of enabledRules) {
    if (rule.rule === 'no-secret-exfil' && hasSecret && hasExfil) {
      return {
        allowed: false,
        reason: "Rule 'no-secret-exfil': label 'secret' cannot flow to 'exfil'",
        rule: 'policy.defaults.rules.no-secret-exfil',
        label: 'secret',
        matched: 'exfil'
      };
    }
    if (rule.rule === 'no-sensitive-exfil' && hasSensitive && hasExfil) {
      return {
        allowed: false,
        reason: "Rule 'no-sensitive-exfil': label 'sensitive' cannot flow to 'exfil'",
        rule: 'policy.defaults.rules.no-sensitive-exfil',
        label: 'sensitive',
        matched: 'exfil'
      };
    }
    if (rule.rule === 'no-send-to-unknown' && hasSend && !primaryInputKnown) {
      return {
        allowed: false,
        reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
        rule: 'policy.defaults.rules.no-send-to-unknown',
        label: 'known',
        matched: 'exfil:send'
      };
    }
    if (rule.rule === 'no-send-to-external' && hasSend && !primaryInputKnownInternal) {
      return {
        allowed: false,
        reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
        rule: 'policy.defaults.rules.no-send-to-external',
        label: 'known:internal',
        matched: 'exfil:send'
      };
    }
    if (rule.rule === 'no-destroy-unknown' && hasTargetedDestructive && !primaryInputKnownTarget) {
      return {
        allowed: false,
        reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
        rule: 'policy.defaults.rules.no-destroy-unknown',
        label: 'known',
        matched: 'destructive:targeted'
      };
    }
    if (
      rule.rule === 'no-unknown-extraction-sources' &&
      ctx.hasSourceArgsMetadata === true
    ) {
      if (sourceArgs.length === 0) {
        continue;
      }
      if (!sourceArgAttestations) {
        return {
          allowed: false,
          reason: "Rule 'no-unknown-extraction-sources': extraction source must carry 'known'",
          rule: 'policy.defaults.rules.no-unknown-extraction-sources',
          label: 'known',
          matched: 'tool'
        };
      }
      for (const sourceArg of sourceArgs) {
        const attestations = sourceArgAttestations.get(sourceArg);
        if (!hasAnyTargetLabel(attestations, DECLARED_CONTROL_ARG_KNOWN_PATTERNS)) {
          return {
            allowed: false,
            reason: "Rule 'no-unknown-extraction-sources': extraction source must carry 'known'",
            rule: 'policy.defaults.rules.no-unknown-extraction-sources',
            label: 'known',
            matched: 'tool'
          };
        }
      }
    }
    if (rule.rule === 'no-untrusted-destructive' && hasUntrustedDestructiveInput && hasDestructive) {
      return {
        allowed: false,
        reason: "Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'",
        rule: 'policy.defaults.rules.no-untrusted-destructive',
        label: 'untrusted',
        matched: 'destructive'
      };
    }
    if (rule.rule === 'no-untrusted-privileged' && hasUntrustedPrivilegedInput && hasPrivileged) {
      return {
        allowed: false,
        reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'",
        rule: 'policy.defaults.rules.no-untrusted-privileged',
        label: 'untrusted',
        matched: 'privileged'
      };
    }
    if (rule.rule === 'no-influenced-advice' && hasInfluenced && hasAdvice) {
      return {
        allowed: false,
        reason: "Rule 'no-influenced-advice': label 'influenced' cannot flow to 'advice' — use structured extraction to debias evaluative output",
        rule: 'policy.defaults.rules.no-influenced-advice',
        label: 'influenced',
        matched: 'advice'
      };
    }
  }

  return null;
}
