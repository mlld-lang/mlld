// RECORD DIRECTIVE
// Defines structured shaping/classification schemas for executable output.

RecordKeyword
  = "/"? "record"

SlashRecord
  = DirectiveContext RecordKeyword _ "@" id:BaseIdentifier _ "=" _ body:RecordBody ending:StandardDirectiveEnding {
      const identifierNode = helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
      const facts = body.entries.filter(entry => entry.kind === 'facts').flatMap(entry => entry.fields);
      const data = body.entries.filter(entry => entry.kind === 'data').flatMap(entry => entry.fields);
      const keyEntry = body.entries.find(entry => entry.kind === 'key');
      const whenEntry = body.entries.find(entry => entry.kind === 'when');
      const validateEntry = body.entries.find(entry => entry.kind === 'validate');
      const displayEntry = body.entries.find(entry => entry.kind === 'display');
      const correlateEntry = body.entries.find(entry => entry.kind === 'correlate');

      const values = {
        identifier: [identifierNode],
        ...(keyEntry ? { key: keyEntry.value } : {}),
        ...(facts.length > 0 ? { facts } : {}),
        ...(data.length > 0 ? { data } : {}),
        ...(displayEntry
          ? { display: displayEntry.value }
          : {}),
        ...(correlateEntry ? { correlate: correlateEntry.value } : {}),
        ...(whenEntry ? { when: whenEntry.rules } : {}),
        ...(validateEntry ? { validate: validateEntry.mode } : {})
      };

      const meta = {
        hasKey: Boolean(keyEntry),
        fieldCount: facts.length + data.length,
        factCount: facts.length,
        dataCount: data.length,
        hasCorrelate: Boolean(correlateEntry),
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
  = RecordKeyEntry
  / RecordFactsEntry
  / RecordDataEntry
  / RecordDisplayEntry
  / RecordCorrelateEntry
  / RecordWhenEntry
  / RecordValidateEntry

RecordKeyEntry
  = "key" _ ":" _ value:BaseIdentifier {
      return { kind: 'key', value };
    }

RecordFactsEntry
  = "facts" _ ":" _ fields:RecordFieldList {
      return { kind: 'facts', fields };
    }

RecordDataEntry
  = "data" _ ":" _ fields:(RecordDataFieldGroups / RecordFieldList) {
      return { kind: 'data', fields };
    }

RecordDataFieldGroups
  = "{" _ entries:RecordDataFieldGroupEntries? _ "}" {
      const groups = entries || [];
      const seen = new Set();
      for (const entry of groups) {
        if (seen.has(entry.trust)) {
          error(`Duplicate data trust group '${entry.trust}'`);
        }
        seen.add(entry.trust);
      }
      return groups.flatMap(entry =>
        entry.fields.map(field => ({
          ...field,
          dataTrust: entry.trust
        }))
      );
    }

RecordDataFieldGroupEntries
  = first:RecordDataFieldGroup rest:(_ ","? _ entry:RecordDataFieldGroup { return entry; })* _ ","? {
      return [first, ...rest];
    }

RecordDataFieldGroup
  = trust:RecordDataTrustLevel _ ":" _ fields:RecordFieldList {
      return { trust, fields };
    }

RecordDisplayEntry
  = "display" _ ":" _ value:(RecordNamedDisplayModes / RecordDisplayList) {
      return { kind: 'display', value };
    }

RecordCorrelateEntry
  = "correlate" _ ":" _ value:RecordBooleanLiteral {
      return { kind: 'correlate', value };
    }

RecordValidateEntry
  = "validate" _ ":" _ mode:RecordValidateMode {
      return { kind: 'validate', mode };
    }

RecordWhenEntry
  = "when" _ "[" _ rules:RecordWhenRules? _ "]" {
      return { kind: 'when', rules: rules || [] };
    }

RecordValidateMode
  = "\"" mode:("demote" / "strict" / "drop") "\"" { return mode; }
  / "'" mode:("demote" / "strict" / "drop") "'" { return mode; }

RecordBooleanLiteral
  = value:$("true" / "false") ![a-zA-Z0-9_] { return value === 'true'; }

RecordFieldList
  = "[" _ fields:RecordFields? _ "]" {
      return fields || [];
    }

RecordDisplayList
  = "[" _ entries:RecordDisplayEntries? _ "]" {
      return {
        kind: 'legacy',
        entries: entries || []
      };
    }

RecordNamedDisplayModes
  = "{" _ entries:RecordNamedDisplayEntries? _ "}" {
      const seen = new Set();
      for (const [name] of entries || []) {
        if (seen.has(name)) {
          error(`Duplicate display mode '${name}'`);
        }
        seen.add(name);
      }
      return {
        kind: 'named',
        modes: Object.fromEntries(entries || [])
      };
    }

RecordNamedDisplayEntries
  = first:RecordNamedDisplayMode rest:(_ ","? _ entry:RecordNamedDisplayMode { return entry; })* _ ","? {
      return [first, ...rest];
    }

RecordNamedDisplayMode
  = name:RecordDisplayModeName _ ":" _ entries:RecordDisplayList {
      return [name, entries.entries];
    }

RecordDisplayEntries
  = first:RecordDisplayItem rest:(_ "," _ item:RecordDisplayItem { return item; })* _ ","? {
      return [first, ...rest];
    }

RecordDisplayItem
  = RecordDisplayRefItem
  / RecordDisplayHandleItem
  / RecordDisplayMaskItem
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

RecordDisplayRefItem
  = "{" _ "ref" _ ":" _ field:RecordDisplayFieldName _ "}" {
      return {
        kind: 'ref',
        field
      };
    }

RecordDisplayHandleItem
  = "{" _ "handle" _ ":" _ field:RecordDisplayFieldName _ "}" {
      return {
        kind: 'handle',
        field
      };
    }

RecordDisplayFieldName
  = "\"" field:BaseIdentifier "\"" { return field; }
  / "'" field:BaseIdentifier "'" { return field; }
  / field:BaseIdentifier { return field; }

RecordDisplayModeName
  = "\"" field:DataLabelIdentifier "\"" { return field; }
  / "'" field:DataLabelIdentifier "'" { return field; }
  / field:DataLabelIdentifier { return field; }

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
        sourceRoot: helpers.recordFieldSourceRoot(source),
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
  = "@input" fields:AnyFieldAccessOptional* {
      return helpers.createVariableReferenceNode('identifier', {
        identifier: 'input',
        fields
      }, location());
    }
  / "@key" fields:AnyFieldAccessOptional* {
      return helpers.createVariableReferenceNode('identifier', {
        identifier: 'key',
        fields
      }, location());
    }
  / "@value" fields:AnyFieldAccessOptional* {
      return helpers.createVariableReferenceNode('identifier', {
        identifier: 'value',
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
  / value:$("object" ![a-zA-Z0-9_]) { return value; }
  / value:$("handle" ![a-zA-Z0-9_]) { return value; }

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
  / source:RecordWhenConditionSource _ operator:("==" / "!=") _ value:RecordWhenLiteral {
      return {
        type: 'comparison',
        ...source,
        operator,
        value
      };
    }
  / source:RecordWhenConditionSource {
      return {
        type: 'truthy',
        ...source
      };
    }

RecordWhenConditionSource
  = root:RecordWhenConditionSourceRoot path:RecordWhenConditionPath? {
      const fields = path || [];
      return {
        field: fields.length > 0 ? fields[fields.length - 1] : root,
        sourceRoot: root,
        ...(fields.length > 0 ? { path: fields } : {})
      };
    }
  / field:BaseIdentifier {
      return { field };
    }

RecordWhenConditionSourceRoot
  = "@input" { return 'input'; }
  / "@key" { return 'key'; }
  / "@value" { return 'value'; }

RecordWhenConditionPath
  = fields:("." name:BaseIdentifier { return name; })+ {
      return fields;
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
  / first:RecordTier rest:RecordTier* overrides:RecordWhenOverrideBlock? {
      return {
        type: 'tiers',
        tiers: [first, ...rest],
        ...(overrides ? { overrides } : {})
      };
    }

RecordTier
  = ":" name:BaseIdentifier { return name; }

RecordWhenOverrideBlock
  = _ "{" _ entries:RecordWhenOverrideEntries? _ "}" {
      const overrides = entries || [];
      const seen = new Set();
      for (const entry of overrides) {
        if (seen.has(entry.kind)) {
          error(`Duplicate record when override '${entry.kind}'`);
        }
        seen.add(entry.kind);
      }
      return Object.fromEntries(
        overrides.map(entry => [entry.kind, entry.value])
      );
    }

RecordWhenOverrideEntries
  = first:RecordWhenOverrideEntry rest:(_ ","? _ entry:RecordWhenOverrideEntry { return entry; })* _ ","? {
      return [first, ...rest];
    }

RecordWhenOverrideEntry
  = "data" _ ":" _ value:RecordWhenDataOverrideValue {
      return { kind: 'data', value };
    }

RecordWhenDataOverrideValue
  = "{" _ entries:RecordWhenDataOverrideGroups? _ "}" {
      const groups = entries || [];
      const seen = new Set();
      for (const entry of groups) {
        if (seen.has(entry.trust)) {
          error(`Duplicate data trust override '${entry.trust}'`);
        }
        seen.add(entry.trust);
      }
      return Object.fromEntries(
        groups.map(entry => [entry.trust, entry.fields])
      );
    }

RecordWhenDataOverrideGroups
  = first:RecordWhenDataOverrideGroup rest:(_ ","? _ entry:RecordWhenDataOverrideGroup { return entry; })* _ ","? {
      return [first, ...rest];
    }

RecordWhenDataOverrideGroup
  = trust:RecordDataTrustLevel _ ":" _ fields:RecordWhenFieldNameList {
      return { trust, fields };
    }

RecordWhenFieldNameList
  = "[" _ fields:RecordWhenFieldNames? _ "]" {
      return fields || [];
    }

RecordWhenFieldNames
  = first:BaseIdentifier rest:(_ ","? _ field:BaseIdentifier { return field; })* _ ","? {
      return [first, ...rest];
    }

RecordDataTrustLevel
  = "trusted" ![a-zA-Z0-9_] { return 'trusted'; }
  / "untrusted" ![a-zA-Z0-9_] { return 'untrusted'; }
