import {
  isShelfSlotRefValue,
  type ShelfSlotRefValue
} from '@core/types/shelf';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { registerCheckpointNormalizer } from './CheckpointManager';

let registered = false;

/**
 * Install checkpoint normalizers for mlld core types whose identity lives on
 * non-enumerable / Symbol / prototype-getter properties. Without explicit
 * rules, `normalizeForSerialization`'s `Object.keys` walk misses that data and
 * distinct instances collide to the same cache key.
 *
 * Idempotent — safe to call multiple times.
 */
export function registerCoreCheckpointNormalizers(): void {
  if (registered) return;
  registered = true;

  // ShelfSlotRefValue: identity is on symbol-keyed non-enumerable props, and
  // the visible fields are prototype getters. Without this rule, every slot
  // ref (@session.a, @session.b, ...) normalizes to `{}`.
  registerCheckpointNormalizer({
    test: (value): value is ShelfSlotRefValue => isShelfSlotRefValue(value),
    normalize: (value, recurse) => {
      const ref = value as ShelfSlotRefValue;
      const currentData = isStructuredValue(ref.current)
        ? asData(ref.current)
        : ref.current;
      return {
        $type: 'shelf-slot-ref',
        shelfName: ref.shelfName,
        slotName: ref.slotName,
        data: recurse(currentData)
      };
    }
  });
}

registerCoreCheckpointNormalizers();
