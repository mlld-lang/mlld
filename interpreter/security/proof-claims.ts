import type { SecurityDescriptor } from '@core/types/security';
import { isAttestationLabel } from '@core/types/security';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';

export function isFactProofLabel(label: string): boolean {
  return typeof label === 'string' && label.startsWith('fact:');
}

export function collectAttestationLabels(
  descriptor: SecurityDescriptor | undefined
): string[] {
  if (!descriptor) {
    return [];
  }

  return Array.from(
    new Set([
      ...(Array.isArray(descriptor.attestations) ? descriptor.attestations : []),
      ...(Array.isArray(descriptor.labels)
        ? descriptor.labels.filter(isAttestationLabel)
        : [])
    ])
  );
}

export function collectProofClaimLabels(
  descriptor: SecurityDescriptor | undefined
): string[] {
  if (!descriptor) {
    return [];
  }

  return Array.from(
    new Set([
      ...collectAttestationLabels(descriptor),
      ...(Array.isArray(descriptor.labels)
        ? descriptor.labels.filter(isFactProofLabel)
        : [])
    ])
  );
}

export function proofStrengthForValue(value: unknown): number {
  const descriptor = extractSecurityDescriptor(value, { recursive: false });
  if (!descriptor) {
    return 0;
  }

  if (collectProofClaimLabels(descriptor).some(isFactProofLabel)) {
    return 3;
  }
  if (collectAttestationLabels(descriptor).length > 0) {
    return 2;
  }
  if (
    (Array.isArray(descriptor.labels) && descriptor.labels.length > 0)
    || (Array.isArray(descriptor.sources) && descriptor.sources.length > 0)
  ) {
    return 1;
  }
  return 0;
}
