import type { PolicyConfig } from './union';

export type ResolvedInputTaint = {
  raw: string[];
  effective: string[];
  isUnlabeled: boolean;
  applyUntrustedDefault: boolean;
};

const SOURCE_PREFIX = 'src:';
const DIR_PREFIX = 'dir:';

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

function isSystemLabel(label: string, defaults?: PolicyConfig['defaults']): boolean {
  if (label.startsWith(SOURCE_PREFIX) || label.startsWith(DIR_PREFIX)) {
    return true;
  }
  const defaultStance = defaults?.unlabeled;
  if (defaultStance && label === defaultStance) {
    return true;
  }
  return false;
}

function hasUserLabels(values: readonly string[], policy?: PolicyConfig): boolean {
  return values.some(label => !isSystemLabel(label, policy?.defaults));
}

export function resolveInputTaint(
  inputTaint: readonly string[] | undefined,
  policy?: PolicyConfig
): ResolvedInputTaint {
  const raw = normalizeList(inputTaint);
  const isUnlabeled = raw.length > 0 && !hasUserLabels(raw, policy);
  const applyUntrustedDefault =
    policy?.defaults?.unlabeled === 'untrusted' && isUnlabeled;
  const effective = applyUntrustedDefault && !raw.includes('untrusted')
    ? [...raw, 'untrusted']
    : raw;
  return {
    raw,
    effective,
    isUnlabeled,
    applyUntrustedDefault
  };
}
