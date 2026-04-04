// SHELF DIRECTIVE
// Declares typed runtime state slots backed by records.

ShelfKeyword
  = "/"? "shelf"

SlashShelf
  = DirectiveContext ShelfKeyword _ "@" id:BaseIdentifier _ "=" _ body:ShelfBody ending:StandardDirectiveEnding {
      const identifierNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      const values = {
        identifier: [identifierNode],
        slots: body.slots
      };

      const meta = {
        slotCount: body.slots.length
      };

      if (ending?.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        DirectiveKind.shelf,
        'shelf',
        values,
        { identifier: id },
        meta,
        location(),
        'shelf'
      );
    }

ShelfBody
  = "{" _ entries:ShelfEntries? _ "}" {
      return {
        slots: entries || []
      };
    }

ShelfEntries
  = first:ShelfEntry rest:(_ ","? _ entry:ShelfEntry { return entry; })* _ ","? {
      const slots = [first, ...rest];
      const seen = new Set();
      for (const slot of slots) {
        if (seen.has(slot.name)) {
          error(`Duplicate shelf slot '${slot.name}'`);
        }
        seen.add(slot.name);
      }
      return slots;
    }

ShelfEntry
  = name:BaseIdentifier _ ":" _ value:(ShelfExpandedSlot / ShelfShorthandSlot) {
      return {
        ...value,
        name,
        location: location()
      };
    }

ShelfShorthandSlot
  = typeRef:ShelfTypeReference from:ShelfFromConstraint? {
      return {
        ...typeRef,
        ...(from ? { from } : {}),
        expanded: false
      };
    }

ShelfExpandedSlot
  = "{" _ entries:ShelfExpandedEntries? _ "}" {
      const slot = {
        record: '',
        cardinality: 'singular',
        optional: false,
        expanded: true
      };

      for (const entry of entries || []) {
        if (entry.kind === 'type') {
          slot.record = entry.value.record;
          slot.cardinality = entry.value.cardinality;
          slot.optional = entry.value.optional;
        } else if (entry.kind === 'merge') {
          slot.merge = entry.value;
        } else if (entry.kind === 'from') {
          slot.from = entry.value;
        }
      }

      if (!slot.record) {
        error("Expanded shelf slots must define a 'type'");
      }

      return slot;
    }

ShelfExpandedEntries
  = first:ShelfExpandedEntry rest:(_ ","? _ entry:ShelfExpandedEntry { return entry; })* _ ","? {
      const entries = [first, ...rest];
      const seen = new Set();
      for (const entry of entries) {
        if (seen.has(entry.kind)) {
          error(`Duplicate shelf slot property '${entry.kind}'`);
        }
        seen.add(entry.kind);
      }
      return entries;
    }

ShelfExpandedEntry
  = "type" _ ":" _ value:ShelfTypeReference { return { kind: 'type', value }; }
  / "merge" _ ":" _ value:ShelfMergeModeValue { return { kind: 'merge', value }; }
  / "from" _ ":" _ value:ShelfFromValue { return { kind: 'from', value }; }

ShelfTypeReference
  = record:BaseIdentifier collection:ShelfCollectionMarker? optional:"?"? {
      return {
        record,
        cardinality: collection ? 'collection' : 'singular',
        optional: Boolean(optional)
      };
    }

ShelfCollectionMarker
  = "[" _ "]" { return true; }

ShelfFromConstraint
  = _ "from" _ value:BaseIdentifier { return value; }

ShelfFromValue
  = value:DataString {
      return value;
    }
  / value:BaseIdentifier {
      return value;
    }

ShelfMergeModeValue
  = "\"" mode:("append" / "upsert" / "replace") "\"" { return mode; }
  / "'" mode:("append" / "upsert" / "replace") "'" { return mode; }
