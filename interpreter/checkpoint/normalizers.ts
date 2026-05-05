import {
  isShelfSlotRefValue,
  type ShelfSlotRefValue
} from '@core/types/shelf';
import { summarizeOpaqueRuntimeValue } from '@core/security/opaque-runtime-values';
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

  // StructuredValue: checkpoint inputs already unwrap top-level structured
  // values to their data view. Do the same for nested wrappers, without
  // reading lazy `.text` getters.
  registerCheckpointNormalizer({
    test: isStructuredValue,
    normalize: (value, recurse) => recurse(asData(value))
  });

  // Executables, environments, and similar runtime carriers are identity /
  // capability objects, not serializable data. Summarize them before the
  // generic walker can descend into captured scopes or provenance graphs.
  registerCheckpointNormalizer({
    test: value => summarizeOpaqueRuntimeValue(value) !== undefined,
    normalize: value => ({
      $type: 'opaque-runtime-value',
      value: summarizeOpaqueRuntimeValue(value)
    })
  });
}

registerCoreCheckpointNormalizers();
