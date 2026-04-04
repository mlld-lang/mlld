import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type { ShelfDefinition, ShelfDirectiveNode, ShelfMergeMode, ShelfSlotCardinality } from '@core/types/shelf';
import { MlldInterpreterError } from '@core/errors';
import { astLocationToSourceLocation } from '@core/types';
import { createShelfVariable } from '@interpreter/shelf/runtime';

function defaultMergeMode(cardinality: ShelfSlotCardinality, hasRecordKey: boolean): ShelfMergeMode {
  if (cardinality === 'singular') {
    return 'replace';
  }
  return hasRecordKey ? 'upsert' : 'append';
}

export async function evaluateShelf(
  directive: ShelfDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const identifierNode = directive.values?.identifier?.[0];
  const name =
    identifierNode && identifierNode.type === 'VariableReference'
      ? identifierNode.identifier
      : directive.raw?.identifier;

  if (!name) {
    throw new MlldInterpreterError('Shelf directive is missing a name', 'shelf', undefined, {
      code: 'INVALID_SHELF_NAME'
    });
  }

  const slots = directive.values?.slots ?? [];
  if (slots.length === 0) {
    throw new MlldInterpreterError(`Shelf '@${name}' must define at least one slot`, 'shelf', undefined, {
      code: 'INVALID_SHELF_SLOTS'
    });
  }

  const normalizedSlots = Object.fromEntries(
    slots.map(slot => {
      const recordDefinition = env.getRecordDefinition(slot.record);
      if (!recordDefinition) {
        throw new MlldInterpreterError(
          `Shelf '@${name}' references unknown record '@${slot.record}'`,
          'shelf',
          slot.location,
          { code: 'UNKNOWN_SHELF_RECORD' }
        );
      }

      if (slot.from && !slots.some(candidate => candidate.name === slot.from)) {
        throw new MlldInterpreterError(
          `Shelf '@${name}' slot '${slot.name}' references unknown slot '${slot.from}'`,
          'shelf',
          slot.location,
          { code: 'INVALID_SHELF_SLOT' }
        );
      }

      if (slot.merge === 'replace' && slot.cardinality === 'collection') {
        throw new MlldInterpreterError(
          `Shelf '@${name}' slot '${slot.name}' cannot use merge:'replace' on a collection`,
          'shelf',
          slot.location,
          { code: 'INVALID_SHELF_SLOT' }
        );
      }

      return [
        slot.name,
        {
          name: slot.name,
          record: slot.record,
          cardinality: slot.cardinality,
          optional: slot.cardinality === 'collection' ? true : slot.optional,
          merge: slot.merge ?? defaultMergeMode(slot.cardinality, Boolean(recordDefinition.key)),
          ...(slot.from ? { from: slot.from } : {}),
          location: astLocationToSourceLocation(slot.location, env.getCurrentFilePath())
        }
      ];
    })
  );

  const definition: ShelfDefinition = {
    name,
    slots: normalizedSlots,
    location: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  };

  env.registerShelfDefinition(name, definition);
  env.setVariable(name, createShelfVariable(env, definition));

  return {
    value: definition,
    env
  };
}
