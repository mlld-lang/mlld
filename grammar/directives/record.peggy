// RECORD DIRECTIVE
// Defines structured shaping/classification schemas for executable output.

RecordKeyword
  = "/"? "record"

SlashRecord
  = DirectiveContext RecordKeyword _ "@" id:BaseIdentifier _ "=" _ body:RecordBody ending:StandardDirectiveEnding {
      const identifierNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      const facts = body.entries.filter(entry => entry.kind === 'facts').flatMap(entry => entry.fields);
      const data = body.entries.filter(entry => entry.kind === 'data').flatMap(entry => entry.fields);
      const whenEntry = body.entries.find(entry => entry.kind === 'when');
      const validateEntry = body.entries.find(entry => entry.kind === 'validate');
      const displayEntries = body.entries
        .filter(entry => entry.kind === 'display')
        .flatMap(entry => entry.entries);
      const unsupported = body.entries
        .filter(entry => entry.kind === 'unsupported')
        .map(entry => ({ key: entry.key, value: entry.value }));

      const values = {
        identifier: [identifierNode],
        ...(facts.length > 0 ? { facts } : {}),
        ...(data.length > 0 ? { data } : {}),
        ...(displayEntries.length > 0 || body.entries.some(entry => entry.kind === 'display')
          ? { display: displayEntries }
          : {}),
        ...(whenEntry ? { when: whenEntry.rules } : {}),
        ...(validateEntry ? { validate: validateEntry.mode } : {}),
        ...(unsupported.length > 0 ? { unsupported } : {})
      };

      const meta = {
        fieldCount: facts.length + data.length,
        factCount: facts.length,
        dataCount: data.length,
        hasWhen: Boolean(whenEntry),
        validate: validateEntry ? validateEntry.mode : 'demote'
      };

      if (ending?.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        DirectiveKind.record,
        'record',
        values,
        { identifier: id },
        meta,
        location(),
        'record'
      );
    }

RecordBody
  = "{" _ entries:RecordEntries? _ "}" {
      return {
        entries: entries || []
      };
    }

RecordEntries
  = first:RecordEntry rest:(_ ","? _ entry:RecordEntry { return entry; })* _ ","? {
      return [first, ...rest];
    }

RecordEntry
  = RecordFactsEntry
  / RecordDataEntry
  / RecordDisplayEntry
  / RecordWhenEntry
  / RecordValidateEntry
  / RecordUnsupportedEntry

RecordFactsEntry
  = "facts" _ ":" _ fields:RecordFieldList {
      return { kind: 'facts', fields };
    }

RecordDataEntry
  = "data" _ ":" _ fields:RecordFieldList {
      return { kind: 'data', fields };
    }

RecordDisplayEntry
  = "display" _ ":" _ entries:RecordDisplayList {
      return { kind: 'display', entries };
    }

RecordValidateEntry
  = "validate" _ ":" _ mode:RecordValidateMode {
      return { kind: 'validate', mode };
    }

RecordWhenEntry
  = "when" _ "[" _ rules:RecordWhenRules? _ "]" {
      return { kind: 'when', rules: rules || [] };
    }

RecordUnsupportedEntry
  = "key" _ ":" _ value:RecordUnsupportedValue {
      return {
        kind: 'unsupported',
        key: 'key',
        value
      };
    }

RecordUnsupportedValue
  = key:BaseIdentifier {
      return helpers.createNode(NodeType.Text, {
        content: key,
        location: location()
      });
    }
  / DataPropertyValue

RecordValidateMode
  = "\"" mode:("demote" / "strict" / "drop") "\"" { return mode; }
  / "'" mode:("demote" / "strict" / "drop") "'" { return mode; }

RecordFieldList
  = "[" _ fields:RecordFields? _ "]" {
      return fields || [];
    }

RecordDisplayList
  = "[" _ entries:RecordDisplayEntries? _ "]" {
      return entries || [];
    }

RecordDisplayEntries
  = first:RecordDisplayItem rest:(_ "," _ item:RecordDisplayItem { return item; })* _ ","? {
      return [first, ...rest];
    }

RecordDisplayItem
  = RecordDisplayMaskItem
  / RecordDisplayBareItem

RecordDisplayBareItem
  = field:BaseIdentifier {
      return {
        kind: 'bare',
        field
      };
    }

RecordDisplayMaskItem
  = "{" _ "mask" _ ":" _ field:RecordDisplayFieldName _ "}" {
      return {
        kind: 'mask',
        field
      };
    }

RecordDisplayFieldName
  = "\"" field:BaseIdentifier "\"" { return field; }
  / "'" field:BaseIdentifier "'" { return field; }

RecordFields
  = first:RecordField rest:(_ "," _ field:RecordField { return field; })* _ ","? {
      return [first, ...rest];
    }

RecordField
  = RecordComputedField
  / RecordInputField

RecordInputField
  = source:RecordFieldSource alias:RecordFieldAlias? fieldType:RecordFieldTypeAnnotation? {
      const sourceName = helpers.recordFieldSourceName(source);
      const fieldName = alias || sourceName;
      return {
        kind: 'input',
        name: fieldName,
        source,
        valueType: fieldType?.valueType,
        optional: fieldType?.optional === true
      };
    }

RecordComputedField
  = "{" _ key:BaseIdentifier _ ":" _ value:DataPropertyValue _ "}" fieldType:RecordFieldTypeAnnotation? {
      return {
        kind: 'computed',
        name: key,
        expression: value,
        valueType: fieldType?.valueType,
        optional: fieldType?.optional === true
      };
    }

RecordFieldSource
  = ref:RecordInputReference { return ref; }
  / key:BaseIdentifier {
      return helpers.createVariableReferenceNode('identifier', {
        identifier: 'input',
        fields: [{ type: 'field', value: key }]
      }, location());
    }

RecordInputReference
  = "@input" fields:AnyFieldAccessOptional+ {
      return helpers.createVariableReferenceNode('identifier', {
        identifier: 'input',
        fields
      }, location());
    }

RecordFieldAlias
  = _ "as" _ alias:BaseIdentifier { return alias; }

RecordFieldTypeAnnotation
  = _ ":" _ valueType:RecordFieldValueType optional:"?"? {
      return {
        valueType,
        optional: Boolean(optional)
      };
    }

RecordFieldValueType
  = value:$("string" ![a-zA-Z0-9_]) { return value; }
  / value:$("number" ![a-zA-Z0-9_]) { return value; }
  / value:$("boolean" ![a-zA-Z0-9_]) { return value; }
  / value:$("array" ![a-zA-Z0-9_]) { return value; }

RecordWhenRules
  = first:RecordWhenRule rest:(_ ","? _ rule:RecordWhenRule { return rule; })* _ ","? {
      return [first, ...rest];
    }

RecordWhenRule
  = condition:RecordWhenCondition _ "=>" _ result:RecordWhenResult {
      return {
        condition,
        result
      };
    }

RecordWhenCondition
  = "*" {
      return { type: 'wildcard' };
    }
  / field:BaseIdentifier _ operator:("==" / "!=") _ value:RecordWhenLiteral {
      return {
        type: 'comparison',
        field,
        operator,
        value
      };
    }
  / field:BaseIdentifier {
      return {
        type: 'truthy',
        field
      };
    }

RecordWhenLiteral
  = "\"" value:$([^"]*) "\"" { return value; }
  / "'" value:$([^']*) "'" { return value; }
  / "true" ![a-zA-Z0-9_] { return true; }
  / "false" ![a-zA-Z0-9_] { return false; }
  / "null" ![a-zA-Z0-9_] { return null; }
  / num:NumberLiteral { return Number(num); }

RecordWhenResult
  = "data" ![a-zA-Z0-9_] {
      return { type: 'data' };
    }
  / first:RecordTier rest:RecordTier* {
      return {
        type: 'tiers',
        tiers: [first, ...rest]
      };
    }

RecordTier
  = ":" name:BaseIdentifier { return name; }
