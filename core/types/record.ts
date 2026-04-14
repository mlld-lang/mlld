import type { TypedDirectiveNode } from './base';
import type { SourceLocation, VariableReferenceNode, BaseMlldNode } from './primitives';
import type { DataValue } from './var';
import { formatDisplayModeName } from '@core/records/display-mode';

export type RecordFieldClassification = 'fact' | 'data';
export type RecordDataTrustLevel = 'trusted' | 'untrusted';
export type RecordFieldValueType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'handle';
export type RecordValidationMode = 'demote' | 'strict' | 'drop';
export type RecordDisplayMode = 'bare' | 'ref' | 'mask' | 'handle';
export type RecordDisplayModeName = string;
export type RecordRootMode = 'object' | 'scalar' | 'map-entry';
export type RecordInputSourceRoot = 'input' | 'key' | 'value';
export type RecordDirection = 'input' | 'output' | 'hybrid';
export type RecordDisplayEntry =
  | { kind: 'bare'; field: string }
  | { kind: 'ref'; field: string }
  | { kind: 'mask'; field: string }
  | { kind: 'handle'; field: string };

export type RecordDisplayDeclaration =
  | { kind: 'legacy'; entries: RecordDisplayEntry[] }
  | { kind: 'named'; modes: Record<RecordDisplayModeName, RecordDisplayEntry[]> };

export type RecordDisplayConfig =
  | { kind: 'open' }
  | RecordDisplayDeclaration;

export interface RecordFieldProjectionMetadata {
  kind: 'field';
  recordName: string;
  fieldName: string;
  classification: RecordFieldClassification;
  dataTrust?: RecordDataTrustLevel;
  display: RecordDisplayConfig;
}

export interface RecordObjectProjectionMetadata {
  kind: 'record';
  recordName: string;
  display: RecordDisplayConfig;
  fields: Record<
    string,
    {
      classification: RecordFieldClassification;
      dataTrust?: RecordDataTrustLevel;
    }
  >;
}

export type RecordProjectionMetadata =
  | RecordFieldProjectionMetadata
  | RecordObjectProjectionMetadata;

export interface RecordInputFieldDefinition {
  kind: 'input';
  name: string;
  classification: RecordFieldClassification;
  dataTrust?: RecordDataTrustLevel;
  sourceRoot: RecordInputSourceRoot;
  source: VariableReferenceNode;
  valueType?: RecordFieldValueType;
  optional: boolean;
}

export interface RecordComputedFieldDefinition {
  kind: 'computed';
  name: string;
  classification: RecordFieldClassification;
  dataTrust?: RecordDataTrustLevel;
  expression: DataValue;
  valueType?: RecordFieldValueType;
  optional: boolean;
}

export type RecordFieldDefinition =
  | RecordInputFieldDefinition
  | RecordComputedFieldDefinition;

export type RecordWhenCondition =
  | { type: 'wildcard' }
  | {
      type: 'truthy';
      field: string;
      sourceRoot?: RecordInputSourceRoot;
      path?: string[];
    }
  | {
      type: 'comparison';
      field: string;
      sourceRoot?: RecordInputSourceRoot;
      path?: string[];
      operator: '==' | '!=';
      value: string | number | boolean | null;
    };

export interface RecordWhenDataOverrides {
  trusted?: string[];
  untrusted?: string[];
}

export interface RecordWhenOverrides {
  data?: RecordWhenDataOverrides;
}

export type RecordWhenResult =
  | { type: 'tiers'; tiers: string[]; overrides?: RecordWhenOverrides }
  | { type: 'data' };

export interface RecordWhenRule {
  condition: RecordWhenCondition;
  result: RecordWhenResult;
}

export interface RecordDefinition {
  name: string;
  key?: string;
  fields: RecordFieldDefinition[];
  rootMode: RecordRootMode;
  display: RecordDisplayConfig;
  direction: RecordDirection;
  correlate?: boolean;
  validate: RecordValidationMode;
  when?: RecordWhenRule[];
  location?: SourceLocation;
}

export function isRecordDefinition(value: unknown): value is RecordDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RecordDefinition>;
  return (
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.fields) &&
    (candidate.rootMode === 'object' || candidate.rootMode === 'scalar' || candidate.rootMode === 'map-entry') &&
    (candidate.direction === 'input' || candidate.direction === 'output' || candidate.direction === 'hybrid')
  );
}

export interface SerializedRecordDefinition {
  __record: true;
  definition: RecordDefinition;
}

export interface SerializedRecordVariable {
  __recordVariable: true;
  name: string;
  definition: RecordDefinition;
  mx?: unknown;
  internal?: unknown;
}

export function serializeRecordDefinition(
  definition: RecordDefinition
): SerializedRecordDefinition {
  return {
    __record: true,
    definition
  };
}

export function isSerializedRecordDefinition(value: unknown): value is SerializedRecordDefinition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as SerializedRecordDefinition).__record === true &&
    (value as SerializedRecordDefinition).definition
  );
}

export function serializeRecordVariable(variable: {
  name: string;
  value: RecordDefinition;
  mx?: unknown;
  internal?: unknown;
}): SerializedRecordVariable {
  return {
    __recordVariable: true,
    name: variable.name,
    definition: variable.value,
    ...(variable.mx !== undefined ? { mx: variable.mx } : {}),
    ...(variable.internal !== undefined ? { internal: variable.internal } : {})
  };
}

export function isSerializedRecordVariable(value: unknown): value is SerializedRecordVariable {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as SerializedRecordVariable).__recordVariable === true &&
    (value as SerializedRecordVariable).definition
  );
}

function formatRecordFieldValueType(field: RecordFieldDefinition): string {
  return field.valueType ? `: ${field.valueType}${field.optional ? '?' : ''}` : '';
}

function formatRecordField(field: RecordFieldDefinition): string {
  const source =
    field.kind === 'input'
      ? formatInputRecordField(field)
      : `{ ${field.name}: ... }`;
  const typeSuffix = formatRecordFieldValueType(field);
  return `${source}${typeSuffix}`;
}

function formatInputRecordField(field: RecordInputFieldDefinition): string {
  const path = (field.source.fields ?? [])
    .map(segment => {
      if (segment.type === 'field' && typeof segment.value === 'string') {
        return segment.value;
      }
      return undefined;
    })
    .filter((segment): segment is string => typeof segment === 'string' && segment.length > 0);

  if (field.source.identifier === 'input' && path.length === 1 && path[0] === field.name) {
    return field.name;
  }

  const sourcePath = path.length > 0 ? `.${path.join('.')}` : '';
  const sourceLabel = `@${field.source.identifier}${sourcePath}`;
  if (path.length === 0 && field.source.identifier === field.name) {
    return field.name;
  }
  return `${sourceLabel} as ${field.name}`;
}

function formatRecordFields(fields: RecordFieldDefinition[]): string {
  return `[${fields.map(formatRecordField).join(', ')}]`;
}

function formatRecordDisplayEntry(entry: RecordDisplayEntry): string {
  switch (entry.kind) {
    case 'bare':
      return entry.field;
    case 'ref':
      return `{ ref: "${entry.field}" }`;
    case 'mask':
      return `{ mask: "${entry.field}" }`;
    case 'handle':
      return `{ handle: "${entry.field}" }`;
    default:
      return entry.field;
  }
}

function formatRecordDisplay(display: RecordDisplayConfig): string | undefined {
  if (display.kind === 'open') {
    return undefined;
  }

  if (display.kind === 'legacy') {
    return `[${display.entries.map(formatRecordDisplayEntry).join(', ')}]`;
  }

  const modes = Object.entries(display.modes).map(
    ([mode, entries]) => `${formatDisplayModeName(mode)}: [${entries.map(formatRecordDisplayEntry).join(', ')}]`
  );
  return `{ ${modes.join(', ')} }`;
}

function formatRecordWhenCondition(condition: RecordWhenCondition): string {
  if (condition.type === 'wildcard') {
    return '*';
  }

  const sourceRoot = condition.sourceRoot ? `@${condition.sourceRoot}` : '@input';
  const path = Array.isArray(condition.path) && condition.path.length > 0
    ? condition.path.join('.')
    : condition.field;
  if (condition.type === 'truthy') {
    return `${sourceRoot}.${path}`;
  }

  return `${sourceRoot}.${path} ${condition.operator} ${JSON.stringify(condition.value)}`;
}

function formatRecordWhenResult(result: RecordWhenResult): string {
  if (result.type === 'data') {
    return 'data';
  }

  const tiers = result.tiers.map(tier => `:${tier}`).join(', ');
  return tiers || 'data';
}

export function formatRecordDefinition(definition: RecordDefinition): string {
  const factFields = definition.fields.filter(field => field.classification === 'fact');
  const trustedDataFields = definition.fields.filter(
    field => field.classification === 'data' && field.dataTrust === 'trusted'
  );
  const untrustedDataFields = definition.fields.filter(
    field => field.classification === 'data' && field.dataTrust !== 'trusted'
  );

  const lines = [`record ${definition.name} {`];
  if (definition.key) {
    lines.push(`  key: ${definition.key}`);
  }
  if (factFields.length > 0) {
    lines.push(`  facts: ${formatRecordFields(factFields)}`);
  }
  if (trustedDataFields.length > 0 && untrustedDataFields.length > 0) {
    lines.push('  data: {');
    lines.push(`    trusted: ${formatRecordFields(trustedDataFields)}`);
    lines.push(`    untrusted: ${formatRecordFields(untrustedDataFields)}`);
    lines.push('  }');
  } else {
    const dataFields = trustedDataFields.length > 0 ? trustedDataFields : untrustedDataFields;
    if (dataFields.length > 0) {
      lines.push(`  data: ${formatRecordFields(dataFields)}`);
    }
  }

  const display = formatRecordDisplay(definition.display);
  if (display) {
    lines.push(`  display: ${display}`);
  }

  if (typeof definition.correlate === 'boolean') {
    lines.push(`  correlate: ${definition.correlate ? 'true' : 'false'}`);
  }

  if (definition.when && definition.when.length > 0) {
    lines.push('  when: [');
    for (const rule of definition.when) {
      lines.push(`    ${formatRecordWhenCondition(rule.condition)} => ${formatRecordWhenResult(rule.result)}`);
    }
    lines.push('  ]');
  }

  if (definition.validate !== 'demote') {
    lines.push(`  validate: "${definition.validate}"`);
  }

  lines.push('}');
  return lines.join('\n');
}

export interface RecordValidationError {
  path: string;
  code: 'required' | 'type' | 'parse';
  message: string;
  expected?: string;
  actual?: string;
}

export interface RecordSchemaMetadata {
  valid: boolean;
  errors: RecordValidationError[];
  mode: RecordValidationMode;
}

export interface RecordDirectiveNode extends TypedDirectiveNode<'record', 'record'> {
  values: {
    identifier: VariableReferenceNode[];
    key?: string;
    facts?: RecordFieldDefinition[];
    data?: RecordFieldDefinition[];
    display?: RecordDisplayDeclaration;
    correlate?: boolean;
    when?: RecordWhenRule[];
    validate?: RecordValidationMode;
    unsupported?: Array<{ key: string; value?: BaseMlldNode | DataValue }>;
  };
  raw: {
    identifier: string;
  };
  meta: {
    hasKey?: boolean;
    fieldCount: number;
    factCount: number;
    dataCount: number;
    hasCorrelate?: boolean;
    hasWhen: boolean;
    validate: RecordValidationMode;
  };
}

export function getRecordDirection(options: {
  display: RecordDisplayConfig;
  correlate?: boolean;
}): RecordDirection {
  if (typeof options.correlate === 'boolean') {
    return 'input';
  }
  if (options.display.kind !== 'open') {
    return 'output';
  }
  return 'hybrid';
}

export function canUseRecordForOutput(definition: RecordDefinition): boolean {
  return definition.direction !== 'input';
}

export function canUseRecordForInput(definition: RecordDefinition): boolean {
  return definition.direction !== 'output';
}

export function resolveRecordFactCorrelation(definition: Pick<RecordDefinition, 'fields' | 'correlate'>): boolean {
  if (typeof definition.correlate === 'boolean') {
    return definition.correlate;
  }
  const factCount = definition.fields.filter(field => field.classification === 'fact').length;
  return factCount > 1;
}
