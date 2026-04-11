import { listPolicyDefaultRuleNames, type PolicyConfig } from './union';
import { resolveInputTaint } from './input-taint';

export const BUILTIN_POLICY_RULES = [
  'no-secret-exfil',
  'no-sensitive-exfil',
  'no-novel-urls',
  'no-send-to-unknown',
  'no-send-to-external',
  'no-destroy-unknown',
  'no-unknown-extraction-sources',
  'no-untrusted-destructive',
  'no-untrusted-privileged',
  'no-influenced-advice',
  'untrusted-llms-get-influenced'
] as const;

export type BuiltinPolicyRuleName = typeof BUILTIN_POLICY_RULES[number];

export function isBuiltinPolicyRuleName(value: string): value is BuiltinPolicyRuleName {
  return (BUILTIN_POLICY_RULES as readonly string[]).includes(value);
}

export function shouldAddInfluencedLabel(
  policy: PolicyConfig | undefined,
  inputTaint: readonly string[] | undefined,
  exeLabels: readonly string[] | undefined
): boolean {
  const enabledRules = listPolicyDefaultRuleNames(policy?.defaults?.rules);
  if (!enabledRules.includes('untrusted-llms-get-influenced')) {
    return false;
  }
  const normalizedExeLabels = Array.from(
    new Set(
      (exeLabels ?? [])
        .map(label => String(label).trim())
        .filter(label => label.length > 0)
    )
  );
  if (!normalizedExeLabels.includes('llm')) {
    return false;
  }
  const resolved = resolveInputTaint(inputTaint, policy);
  return resolved.effective.includes('untrusted');
}
