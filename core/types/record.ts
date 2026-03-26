import type { TypedDirectiveNode } from './base';
import type { SourceLocation, VariableReferenceNode, BaseMlldNode } from './primitives';
import type { DataValue } from './var';

export type RecordFieldClassification = 'fact' | 'data';
export type RecordScalarType = 'string' | 'number' | 'boolean';
export type RecordValidationMode = 'demote' | 'strict' | 'drop';
export type RecordDisplayEntry =
  | { kind: 'bare'; field: string }
  | { kind: 'mask'; field: string };

export interface RecordInputFieldDefinition {
  kind: 'input';
  name: string;
  classification: RecordFieldClassification;
  source: VariableReferenceNode;
  valueType?: RecordScalarType;
  optional: boolean;
}

export interface RecordComputedFieldDefinition {
  kind: 'computed';
  name: string;
  classification: RecordFieldClassification;
  expression: DataValue;
  valueType?: RecordScalarType;
  optional: boolean;
}

export type RecordFieldDefinition =
  | RecordInputFieldDefinition
  | RecordComputedFieldDefinition;

export type RecordWhenCondition =
  | { type: 'wildcard' }
  | { type: 'truthy'; field: string }
  | {
      type: 'comparison';
      field: string;
      operator: '==' | '!=';
      value: string | number | boolean | null;
    };

export type RecordWhenResult =
  | { type: 'tiers'; tiers: string[] }
  | { type: 'data' };

export interface RecordWhenRule {
  condition: RecordWhenCondition;
  result: RecordWhenResult;
}

export interface RecordDefinition {
  name: string;
  fields: RecordFieldDefinition[];
  display?: RecordDisplayEntry[];
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
    facts?: RecordFieldDefinition[];
    data?: RecordFieldDefinition[];
    display?: RecordDisplayEntry[];
    when?: RecordWhenRule[];
    validate?: RecordValidationMode;
    unsupported?: Array<{ key: string; value?: BaseMlldNode | DataValue }>;
  };
  raw: {
    identifier: string;
  };
  meta: {
    fieldCount: number;
    factCount: number;
    dataCount: number;
    hasWhen: boolean;
    validate: RecordValidationMode;
  };
}
