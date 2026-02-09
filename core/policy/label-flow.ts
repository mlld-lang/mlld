import type { PolicyConfig, PolicyLabels, PolicyOperations } from './union';
import { isBuiltinPolicyRuleName } from './builtin-rules';
import { resolveInputTaint } from './input-taint';

export type FlowChannel = 'arg' | 'stdin' | 'using';

export interface FlowContext {
  inputTaint: readonly string[];
  opLabels: readonly string[];
  exeLabels: readonly string[];
  flowChannel?: FlowChannel;
  command?: string;
}

export interface LabelFlowCheckResult {
  allowed: boolean;
  reason?: string;
  rule?: string;
  label?: string;
  matched?: string;
}

type MatchResult = { match: string; specificity: number };

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
    const mapped = mappings[target];
    if (mapped) {
      expanded.add(mapped);
    }
  }
  return Array.from(expanded);
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

  const builtInResult = checkBuiltinPolicyRules(
    inputTaint,
    opTargets,
    normalizeRuleList(policy.defaults?.rules)
  );
  if (builtInResult) {
    return builtInResult;
  }

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
  const hasExfil = hasTargetLabel(opTargets, 'exfil');
  const hasDestructive = hasTargetLabel(opTargets, 'destructive');
  const hasPrivileged = hasTargetLabel(opTargets, 'privileged');

  for (const rule of enabledRules) {
    if (rule === 'no-secret-exfil' && hasSecret && hasExfil) {
      return {
        allowed: false,
        reason: "Label 'secret' cannot flow to 'exfil'",
        rule: 'policy.defaults.rules.no-secret-exfil',
        label: 'secret',
        matched: 'exfil'
      };
    }
    if (rule === 'no-sensitive-exfil' && hasSensitive && hasExfil) {
      return {
        allowed: false,
        reason: "Label 'sensitive' cannot flow to 'exfil'",
        rule: 'policy.defaults.rules.no-sensitive-exfil',
        label: 'sensitive',
        matched: 'exfil'
      };
    }
    if (rule === 'no-untrusted-destructive' && hasUntrusted && hasDestructive) {
      return {
        allowed: false,
        reason: "Label 'untrusted' cannot flow to 'destructive'",
        rule: 'policy.defaults.rules.no-untrusted-destructive',
        label: 'untrusted',
        matched: 'destructive'
      };
    }
    if (rule === 'no-untrusted-privileged' && hasUntrusted && hasPrivileged) {
      return {
        allowed: false,
        reason: "Label 'untrusted' cannot flow to 'privileged'",
        rule: 'policy.defaults.rules.no-untrusted-privileged',
        label: 'untrusted',
        matched: 'privileged'
      };
    }
  }

  return null;
}
