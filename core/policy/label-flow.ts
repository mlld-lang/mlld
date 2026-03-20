import type { PolicyConfig, PolicyLabels, PolicyOperations } from './union';
import { isBuiltinPolicyRuleName } from './builtin-rules';
import { resolveInputTaint } from './input-taint';

export type FlowChannel = 'arg' | 'stdin' | 'using';

export interface FlowInputDescriptor {
  labels?: readonly string[];
  taint?: readonly string[];
  sources?: readonly string[];
}

export interface FlowContext {
  inputTaint: readonly string[];
  opLabels: readonly string[];
  exeLabels: readonly string[];
  flowChannel?: FlowChannel;
  command?: string;
  inputs?: readonly FlowInputDescriptor[];
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
  'no-untrusted-destructive',
  'no-untrusted-privileged'
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

function matchesPrefix(rule: string, target: string): boolean {
  if (rule === '*') {
    return true;
  }
  return target === rule || target.startsWith(`${rule}:`);
}

function ruleSpecificity(rule: string): number {
  if (rule === '*') {
    return 0;
  }
  return rule.split(':').length;
}

function findBestMatch(
  targets: readonly string[],
  rules: readonly string[]
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const target of targets) {
    for (const rule of rules) {
      if (!matchesPrefix(rule, target)) {
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
      const matches = labels.some(label => matchesPrefix(label, target));
      if (matches) {
        expanded.add(riskCategory);
      }
    }
  }
  return Array.from(expanded);
}

export function hasManagedPolicyLabelFlow(policy?: PolicyConfig): boolean {
  if (!policy) {
    return false;
  }
  if (policy.labels && Object.keys(policy.labels).length > 0) {
    return true;
  }
  return normalizeRuleList(policy.defaults?.rules).some(rule => LABEL_FLOW_BUILTIN_RULES.has(rule));
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
    const rule = labelRules[label];
    if (!rule) {
      continue;
    }
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
        rule: `policy.labels.${label}.deny`,
        label,
        matched: denyMatch.match
      };
    }
  }

  if (resolvedInput.applyUntrustedDefault) {
    for (const label of resolvedInput.raw) {
      const rule = labelRules[label];
      const allowRules = normalizeList(rule?.allow);
      if (allowRules.length === 0) {
        continue;
      }
      const allowMatch = findBestMatch(opTargets, allowRules);
      if (!allowMatch) {
        return {
          allowed: false,
          reason: `Label '${label}' is not explicitly allowed for this operation`,
          rule: `policy.labels.${label}.allow`,
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

  const enabledRules = normalizeRuleList(policy.defaults?.rules).filter(isBuiltinPolicyRuleName);
  const requiresPrimaryInputCheck = enabledRules.some(rule =>
    rule === 'no-send-to-unknown' ||
    rule === 'no-send-to-external' ||
    rule === 'no-destroy-unknown'
  );
  if (inputTaint.length === 0 && !requiresPrimaryInputCheck) {
    return { allowed: true };
  }

  const opTargets = expandOperationLabels(rawOpTargets, policy.operations);
  const builtInResult = checkBuiltinPolicyRules(ctx, inputTaint, opTargets, enabledRules);
  if (builtInResult) {
    return builtInResult;
  }

  if (inputTaint.length === 0) {
    return { allowed: true };
  }

  return checkExplicitLabelFlowRules(ctx, policy);
}

function normalizeRuleList(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return normalizeList(value.map(entry => String(entry)));
  }
  return normalizeList([String(value)]);
}

function hasTargetLabel(targets: readonly string[], label: string): boolean {
  return Boolean(findBestMatch(targets, [label]));
}

function checkBuiltinPolicyRules(
  ctx: FlowContext,
  inputTaint: readonly string[],
  opTargets: readonly string[],
  rules: readonly string[]
): LabelFlowCheckResult | null {
  const enabledRules = rules.filter(rule => isBuiltinPolicyRuleName(rule));
  if (enabledRules.length === 0) {
    return null;
  }

  const hasSecret = inputTaint.includes('secret');
  const hasSensitive = inputTaint.includes('sensitive');
  const hasUntrusted = inputTaint.includes('untrusted');
  const hasInfluenced = inputTaint.includes('influenced');
  const hasExfil = hasTargetLabel(opTargets, 'exfil');
  const hasSend = hasTargetLabel(opTargets, 'exfil:send');
  const hasDestructive = hasTargetLabel(opTargets, 'destructive');
  const hasAdvice = hasTargetLabel(opTargets, 'advice');
  const hasTargetedDestructive = hasTargetLabel(opTargets, 'destructive:targeted');
  const hasPrivileged = hasTargetLabel(opTargets, 'privileged');
  const primaryInput = ctx.inputs?.[0];
  const primaryInputTaint = normalizeList([
    ...(primaryInput?.labels ?? []),
    ...(primaryInput?.taint ?? [])
  ]);
  const primaryInputKnown = hasTargetLabel(primaryInputTaint, 'known');
  const primaryInputKnownInternal = hasTargetLabel(primaryInputTaint, 'known:internal');

  for (const rule of enabledRules) {
    if (rule === 'no-secret-exfil' && hasSecret && hasExfil) {
      return {
        allowed: false,
        reason: "Rule 'no-secret-exfil': label 'secret' cannot flow to 'exfil'",
        rule: 'policy.defaults.rules.no-secret-exfil',
        label: 'secret',
        matched: 'exfil'
      };
    }
    if (rule === 'no-sensitive-exfil' && hasSensitive && hasExfil) {
      return {
        allowed: false,
        reason: "Rule 'no-sensitive-exfil': label 'sensitive' cannot flow to 'exfil'",
        rule: 'policy.defaults.rules.no-sensitive-exfil',
        label: 'sensitive',
        matched: 'exfil'
      };
    }
    if (rule === 'no-send-to-unknown' && hasSend && !primaryInputKnown) {
      return {
        allowed: false,
        reason: "Rule 'no-send-to-unknown': exfil:send destination must carry 'known'",
        rule: 'policy.defaults.rules.no-send-to-unknown',
        label: 'known',
        matched: 'exfil:send'
      };
    }
    if (rule === 'no-send-to-external' && hasSend && !primaryInputKnownInternal) {
      return {
        allowed: false,
        reason: "Rule 'no-send-to-external': exfil:send destination must carry 'known:internal'",
        rule: 'policy.defaults.rules.no-send-to-external',
        label: 'known:internal',
        matched: 'exfil:send'
      };
    }
    if (rule === 'no-destroy-unknown' && hasTargetedDestructive && !primaryInputKnown) {
      return {
        allowed: false,
        reason: "Rule 'no-destroy-unknown': destructive:targeted target must carry 'known'",
        rule: 'policy.defaults.rules.no-destroy-unknown',
        label: 'known',
        matched: 'destructive:targeted'
      };
    }
    if (rule === 'no-untrusted-destructive' && hasUntrusted && hasDestructive) {
      return {
        allowed: false,
        reason: "Rule 'no-untrusted-destructive': label 'untrusted' cannot flow to 'destructive'",
        rule: 'policy.defaults.rules.no-untrusted-destructive',
        label: 'untrusted',
        matched: 'destructive'
      };
    }
    if (rule === 'no-untrusted-privileged' && hasUntrusted && hasPrivileged) {
      return {
        allowed: false,
        reason: "Rule 'no-untrusted-privileged': label 'untrusted' cannot flow to 'privileged'",
        rule: 'policy.defaults.rules.no-untrusted-privileged',
        label: 'untrusted',
        matched: 'privileged'
      };
    }
    if (rule === 'no-influenced-advice' && hasInfluenced && hasAdvice) {
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
