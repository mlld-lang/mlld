import {
  astLocationToSourceLocation,
  type SourceLocation
} from '@core/types';
import type { RecordDefinition } from '@core/types/record';
import type {
  ShelfDefinition,
  ShelfDirectiveNode,
  ShelfMergeMode,
  ShelfSlotCardinality
} from '@core/types/shelf';
import type { StaticValidationIssue } from './issues';

export interface ShelfDefinitionBuildResult {
  definition?: ShelfDefinition;
  issues: StaticValidationIssue[];
}

function issue(
  code: string,
  message: string,
  location?: SourceLocation
): StaticValidationIssue {
  return { code, message, location };
}

function toDirectiveLocation(
  directive: ShelfDirectiveNode,
  filePath?: string
): SourceLocation | undefined {
  return astLocationToSourceLocation(directive.location, filePath);
}

function toSlotLocation(
  slot: { location?: { start: any; end: any } },
  filePath?: string,
  fallback?: SourceLocation
): SourceLocation | undefined {
  return astLocationToSourceLocation(slot.location, filePath) ?? fallback;
}

export function defaultMergeMode(
  cardinality: ShelfSlotCardinality,
  hasRecordKey: boolean
): ShelfMergeMode {
  if (cardinality === 'singular') {
    return 'replace';
  }
  return hasRecordKey ? 'upsert' : 'append';
}

export function buildShelfDefinitionFromDirective(
  directive: ShelfDirectiveNode,
  options: {
    filePath?: string;
    records?: ReadonlyMap<string, Pick<RecordDefinition, 'key'> | RecordDefinition>;
  } = {}
): ShelfDefinitionBuildResult {
  const issues: StaticValidationIssue[] = [];
  const directiveLocation = toDirectiveLocation(directive, options.filePath);
  const identifierNode = directive.values?.identifier?.[0];
  const name =
    identifierNode && identifierNode.type === 'VariableReference'
      ? identifierNode.identifier
      : directive.raw?.identifier;

  if (!name) {
    issues.push(issue('INVALID_SHELF_NAME', 'Shelf directive is missing a name', directiveLocation));
    return { issues };
  }

  const slots = directive.values?.slots ?? [];
  if (slots.length === 0) {
    issues.push(issue(
      'INVALID_SHELF_SLOTS',
      `Shelf '@${name}' must define at least one slot`,
      directiveLocation
    ));
    return { issues };
  }

  const normalizedSlots = Object.fromEntries(
    slots.map(slot => {
      const slotLocation = toSlotLocation(slot, options.filePath, directiveLocation);
      const recordDefinition = options.records?.get(slot.record);
      if (!recordDefinition) {
        issues.push(issue(
          'UNKNOWN_SHELF_RECORD',
          `Shelf '@${name}' references unknown record '@${slot.record}'`,
          slotLocation
        ));
      }

      if (slot.from && !slots.some(candidate => candidate.name === slot.from)) {
        issues.push(issue(
          'INVALID_SHELF_SLOT',
          `Shelf '@${name}' slot '${slot.name}' references unknown slot '${slot.from}'`,
          slotLocation
        ));
      }

      if (slot.merge === 'replace' && slot.cardinality === 'collection') {
        issues.push(issue(
          'INVALID_SHELF_SLOT',
          `Shelf '@${name}' slot '${slot.name}' cannot use merge:'replace' on a collection`,
          slotLocation
        ));
      }

      return [
        slot.name,
        {
          name: slot.name,
          record: slot.record,
          cardinality: slot.cardinality,
          optional: slot.cardinality === 'collection' ? true : slot.optional,
          merge: slot.merge ?? defaultMergeMode(slot.cardinality, Boolean(recordDefinition?.key)),
          ...(slot.from ? { from: slot.from } : {}),
          location: slotLocation
        }
      ];
    })
  );

  if (issues.length > 0) {
    return { issues };
  }

  return {
    definition: {
      name,
      slots: normalizedSlots,
      location: directiveLocation
    },
    issues
  };
}
