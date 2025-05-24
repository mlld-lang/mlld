/**
 * Data directive type definitions
 */
import { TypedDirectiveNode } from '@core/types/nodes/directive';
import { VariableReference } from '@core/types/nodes';
import { JsonValue } from '@core/types/common';

// Value definitions
export type VariableNodeArray = Array<VariableReference>;

export interface DataValues {
  identifier: VariableNodeArray;
  value: JsonValue; // The parsed JSON value
}

// Raw and meta definitions
export interface DataRaw {
  identifier: string;
  value: string; // The raw JSON string
}

export interface DataMeta {
  sourceType: 'json';
  valueType: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
}

/**
 * Data directive node - @data var = {...json...}
 */
export interface DataDirectiveNode extends TypedDirectiveNode<'data', 'dataVariable'> {
  values: DataValues;
  raw: DataRaw;
  meta: DataMeta;
}