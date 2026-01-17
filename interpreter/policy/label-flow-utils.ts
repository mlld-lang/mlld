import type { SecurityDescriptor } from '@core/types/security';
import { mergeDescriptors } from '@core/types/security';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';

export function collectInputDescriptor(value: unknown): SecurityDescriptor | undefined {
  return extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
}

export function mergeInputDescriptors(
  ...descriptors: Array<SecurityDescriptor | undefined>
): SecurityDescriptor | undefined {
  const defined = descriptors.filter(Boolean) as SecurityDescriptor[];
  if (defined.length === 0) {
    return undefined;
  }
  return mergeDescriptors(...defined);
}

export function descriptorToInputTaint(descriptor?: SecurityDescriptor): string[] {
  if (!descriptor) {
    return [];
  }
  const labels = Array.isArray(descriptor.labels) ? descriptor.labels : [];
  const taint = Array.isArray(descriptor.taint) ? descriptor.taint : [];
  const merged = new Set<string>();
  for (const label of labels) {
    if (label) {
      merged.add(String(label));
    }
  }
  for (const entry of taint) {
    if (entry) {
      merged.add(String(entry));
    }
  }
  return Array.from(merged);
}

export function collectInputTaint(value: unknown): string[] {
  return descriptorToInputTaint(collectInputDescriptor(value));
}
