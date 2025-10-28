import { expect } from 'vitest';
import type { SecurityDescriptor, DataLabel, TaintLevel } from '@core/types/security';

export function expectSecurityLabels(
  descriptor: SecurityDescriptor | undefined,
  labels: DataLabel[]
): void {
  const actual = descriptor ? Array.from(descriptor.labels).sort() : [];
  const expected = [...labels].sort();
  expect(actual).toEqual(expected);
}

export function expectTaintLevel(
  descriptor: SecurityDescriptor | undefined,
  taint: TaintLevel
): void {
  expect(descriptor?.taintLevel ?? 'unknown').toBe(taint);
}
