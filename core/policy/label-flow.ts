import type { PolicyConfig } from './union';

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

export function checkLabelFlow(
  ctx: FlowContext,
  policy?: PolicyConfig
): LabelFlowCheckResult {
  const labelRules = policy?.labels;
  if (!labelRules) {
    return { allowed: true };
  }

  if (ctx.flowChannel === 'using') {
    return { allowed: true };
  }

  const inputTaint = normalizeList(ctx.inputTaint);
  if (inputTaint.length === 0) {
    return { allowed: true };
  }

  const opTargets = normalizeList([
    ...(ctx.opLabels ?? []),
    ...(ctx.exeLabels ?? [])
  ]);
  if (opTargets.length === 0) {
    return { allowed: true };
  }

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

  return { allowed: true };
}
