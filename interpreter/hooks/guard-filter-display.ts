import type { GuardFilterKind } from '@core/types/guard';
import { normalizeNamedOperationSelector } from '@core/policy/operation-labels';

export function formatGuardFilterForMetadata(
  filterKind: GuardFilterKind,
  filterValue: string
): string {
  if (filterKind !== 'operation') {
    return `${filterKind}:${filterValue}`;
  }

  const normalized =
    normalizeNamedOperationSelector(filterValue) ??
    (typeof filterValue === 'string' ? filterValue.trim().toLowerCase() : '');

  if (normalized.startsWith('op:')) {
    return `operation:${normalized.slice(3)}`;
  }
  return `operation:${normalized}`;
}
