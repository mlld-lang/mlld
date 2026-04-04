import type { TypedDirectiveNode } from './base';
import type { SourceLocation, VariableReferenceNode, BaseMlldNode } from './primitives';
import type { DataValue } from './var';

export type RecordFieldClassification = 'fact' | 'data';
export type RecordDataTrustLevel = 'trusted' | 'untrusted';
export type RecordFieldValueType = 'string' | 'number' | 'boolean' | 'array' | 'handle';
export type RecordValidationMode = 'demote' | 'strict' | 'drop';
export type RecordDisplayMode = 'bare' | 'ref' | 'mask' | 'handle';
export type RecordRootMode = 'object' | 'scalar' | 'map-entry';
export type RecordInputSourceRoot = 'input' | 'key' | 'value';
export type RecordDisplayEntry =
  | { kind: 'bare'; field: string }
  | { kind: 'ref'; field: string }
  | { kind: 'mask'; field: string }
  | { kind: 'handle'; field: string };

export type RecordDisplayDeclaration =
  | { kind: 'legacy'; entries: RecordDisplayEntry[] }
  | { kind: 'named'; modes: Record<string, RecordDisplayEntry[]> };

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
  validate: RecordValidationMode;
  when?: RecordWhenRule[];
  location?: SourceLocation;
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
    hasWhen: boolean;
    validate: RecordValidationMode;
  };
}
