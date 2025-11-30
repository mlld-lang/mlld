import { expect } from 'vitest';
import type { SecurityDescriptor, DataLabel } from '@core/types/security';

export function expectSecurityLabels(
  descriptor: SecurityDescriptor | undefined,
  labels: DataLabel[]
): void {
  const actual = descriptor ? Array.from(descriptor.labels).sort() : [];
  const expected = [...labels].sort();
  expect(actual).toEqual(expected);
}

export function expectTaint(
  descriptor: SecurityDescriptor | undefined,
  taint: DataLabel[]
): void {
  const actual = descriptor ? Array.from(descriptor.taint).sort() : [];
  const expected = [...taint].sort();
  expect(actual).toEqual(expected);
}
