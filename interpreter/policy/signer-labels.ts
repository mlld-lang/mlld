import { minimatch } from 'minimatch';
import type { FileIntegrityStatus } from '@core/security';
import type { PolicyConfig, PolicyTrustStance } from '@core/policy/union';
import type { DataLabel } from '@core/types/security';

function resolveDefaultLabels(defaultUnlabeled?: PolicyTrustStance): DataLabel[] {
  return defaultUnlabeled ? [defaultUnlabeled] : [];
}

export function matchesSignerPattern(identity: string, pattern: string): boolean {
  const normalizedIdentity = identity.trim();
  const normalizedPattern = pattern.trim();
  if (!normalizedIdentity || !normalizedPattern) {
    return false;
  }
  if (normalizedPattern === '*' || normalizedPattern === '**') {
    return true;
  }
  return minimatch(normalizedIdentity, normalizedPattern, { dot: true });
}

export function matchesAnySignerPattern(identity: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesSignerPattern(identity, pattern));
}

export function resolveSignerLabels(
  signerIdentity: string | null,
  verifyStatus: FileIntegrityStatus | 'unsigned',
  policySigners?: PolicyConfig['signers'],
  defaultUnlabeled?: PolicyTrustStance
): DataLabel[] {
  if (verifyStatus === 'modified' || verifyStatus === 'corrupted') {
    return ['untrusted'];
  }

  if (verifyStatus !== 'verified' || !signerIdentity) {
    return resolveDefaultLabels(defaultUnlabeled);
  }

  const labels = new Set<DataLabel>();
  for (const [pattern, configuredLabels] of Object.entries(policySigners ?? {})) {
    if (!matchesSignerPattern(signerIdentity, pattern)) {
      continue;
    }
    for (const label of configuredLabels) {
      labels.add(label);
    }
  }

  return labels.size > 0 ? Array.from(labels) : resolveDefaultLabels(defaultUnlabeled);
}
