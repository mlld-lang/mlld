/**
 * Object compatibility utilities for spread syntax migration
 *
 * This module provides conversion helpers between the old `properties` format
 * and the new `entries` format during the migration to support object spread syntax.
 */

import { DataObjectValue, DataObjectEntry, DataValue } from '@core/types/var';
import type { VariableNodeArray } from '@core/types/values';

/**
 * Converts entries array to properties record for backwards compatibility.
 * Ignores spread entries (they must be evaluated first).
 *
 * @param entries - Array of object entries (pairs and spreads)
 * @returns Record of key-value pairs (spreads omitted)
 */
export function convertEntriesToProperties(
  entries: DataObjectEntry[]
): Record<string, DataValue> {
  const props: Record<string, DataValue> = {};
  for (const entry of entries) {
    if (entry.type === 'pair') {
      props[entry.key] = entry.value;
    }
    // Skip spreads - they need evaluation context
  }
  return props;
}

/**
 * Converts legacy properties record to entries format.
 * Creates pair entries for each property.
 *
 * @param properties - Record of key-value pairs
 * @returns Array of pair entries
 */
export function convertPropertiesToEntries(
  properties: Record<string, DataValue>
): DataObjectEntry[] {
  return Object.entries(properties).map(([key, value]) => ({
    type: 'pair' as const,
    key,
    value
  }));
}

/**
 * Checks if an object has any spread entries.
 *
 * @param obj - Data object value
 * @returns True if object contains at least one spread entry
 */
export function hasSpreads(obj: DataObjectValue): boolean {
  return obj.entries.some(e => e.type === 'spread');
}

/**
 * Gets the value for a specific key from an object's entries.
 * Returns undefined if key not found or if key is shadowed by a spread.
 *
 * @param obj - Data object value
 * @param key - Property key to look up
 * @returns The value if found, undefined otherwise
 */
export function getEntryValue(obj: DataObjectValue, key: string): DataValue | undefined {
  for (const entry of obj.entries) {
    if (entry.type === 'pair' && entry.key === key) {
      return entry.value;
    }
  }
  return undefined;
}

/**
 * Gets all pair entries from an object, excluding spreads.
 *
 * @param obj - Data object value
 * @returns Array of pair entries only
 */
export function getPairEntries(obj: DataObjectValue): Array<{ type: 'pair'; key: string; value: DataValue }> {
  return obj.entries.filter((e): e is { type: 'pair'; key: string; value: DataValue } =>
    e.type === 'pair'
  );
}

/**
 * Gets all spread entries from an object.
 *
 * @param obj - Data object value
 * @returns Array of spread entries only
 */
export function getSpreadEntries(obj: DataObjectValue): Array<{ type: 'spread'; value: VariableNodeArray }> {
  return obj.entries.filter((e): e is { type: 'spread'; value: VariableNodeArray } =>
    e.type === 'spread'
  );
}
