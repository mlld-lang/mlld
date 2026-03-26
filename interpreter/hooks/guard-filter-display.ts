import type { GuardFilterKind } from '@core/types/guard';
import { normalizeNamedOperationRef } from '@core/policy/operation-labels';

export function formatGuardFilterForMetadata(
  filterKind: GuardFilterKind,
  filterValue: string
): string {
  if (filterKind !== 'operation') {
    return `${filterKind}:${filterValue}`;
  }

  const normalized =
    normalizeNamedOperationRef(filterValue) ??
    (typeof filterValue === 'string' ? filterValue.trim().toLowerCase() : '');

  if (normalized.startsWith('op:@')) {
    return `operation:${normalized.slice(4)}`;
  }
  if (normalized.startsWith('op:')) {
    return `operation:${normalized.slice(3)}`;
  }
  return `operation:${normalized}`;
}
