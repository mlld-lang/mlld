import type { PolicyConfig } from './union';
import { resolveInputTaint } from './input-taint';

export const BUILTIN_POLICY_RULES = [
  'no-secret-exfil',
  'no-sensitive-exfil',
  'no-untrusted-destructive',
  'no-untrusted-privileged',
  'untrusted-llms-get-influenced'
] as const;

export type BuiltinPolicyRuleName = typeof BUILTIN_POLICY_RULES[number];

export function isBuiltinPolicyRuleName(value: string): value is BuiltinPolicyRuleName {
  return (BUILTIN_POLICY_RULES as readonly string[]).includes(value);
}

function normalizeStringList(values?: readonly unknown[]): string[] {
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

export function shouldAddInfluencedLabel(
  policy: PolicyConfig | undefined,
  inputTaint: readonly string[] | undefined,
  exeLabels: readonly string[] | undefined
): boolean {
  const enabledRules = normalizeStringList(policy?.defaults?.rules);
  if (!enabledRules.includes('untrusted-llms-get-influenced')) {
    return false;
  }
  const normalizedExeLabels = normalizeStringList(exeLabels);
  if (!normalizedExeLabels.includes('llm')) {
    return false;
  }
  const resolved = resolveInputTaint(inputTaint, policy);
  return resolved.effective.includes('untrusted');
}
