/**
 * Data directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, VariableNodeArray } from './values';

/**
 * Data directive raw values
 */
export interface DataRaw {
  identifier: string;
  value: string;
}

/**
 * Data directive metadata
 */
export interface DataMeta {
  [key: string]: unknown;
}

/**
 * Base Data directive node
 */
export interface DataDirectiveNode extends TypedDirectiveNode<'data', 'dataAssignment'> {
  values: DataValues;
  raw: DataRaw;
  meta: DataMeta;
}

/**
 * Data values can be complex with nested structures
 */
export interface DataValues {
  identifier: VariableNodeArray;
  value: DataValue;
}

/**
 * Recursive type for data values - can be primitives, objects, arrays, or directives
 */
export type DataValue = 
  | ContentNodeArray // String literals, numbers, booleans represented as content nodes
  | DataObjectValue
  | DataArrayValue
  | DirectiveNode; // Nested directive

/**
 * An object value in a data structure
 */
export interface DataObjectValue {
  type: 'object';
  properties: {
    [key: string]: DataValue; // Each property can be any data value including nested objects/arrays/directives
  };
}

/**
 * An array value in a data structure
 */
export interface DataArrayValue {
  type: 'array';
  items: DataValue[]; // Each item can be any data value including nested objects/arrays/directives
}

/**
 * Data Assignment directive - @data var = value
 * Where value can be a primitive, object, array, or directive
 */
export interface DataAssignmentDirectiveNode extends DataDirectiveNode {
  subtype: 'dataAssignment';
  values: {
    identifier: VariableNodeArray;
    value: DataValue;
  };
  raw: {
    identifier: string;
    value: string;
  };
}

/**
 * Type guards to check the type of a data value
 */
export function isDataObjectValue(value: DataValue): value is DataObjectValue {
  return typeof value === 'object' && !Array.isArray(value) && 'type' in value && value.type === 'object';
}

export function isDataArrayValue(value: DataValue): value is DataArrayValue {
  return typeof value === 'object' && !Array.isArray(value) && 'type' in value && value.type === 'array';
}

export function isDirectiveValue(value: DataValue): value is DirectiveNode {
  return typeof value === 'object' && !Array.isArray(value) && 'kind' in value;
}

export function isContentNodeArray(value: DataValue): value is ContentNodeArray {
  return Array.isArray(value) && (value.length === 0 || 'type' in value[0]);
}

/**
 * Additional type guards used by the interpreter
 */
export function isVariableReferenceValue(value: unknown): value is VariableNodeArray {
  return typeof value === 'object' && value !== null && 'type' in value && (value as any).type === 'VariableReference';
}

export function isTemplateValue(value: unknown): value is ContentNodeArray {
  return Array.isArray(value) && value.some(item => 
    (typeof item === 'object' && item !== null && 'type' in item) &&
    ((item as any).type === 'Text' || 
    ((item as any).type === 'VariableReference' && (item as any).valueType === 'varInterpolation'))
  );
}

export function isPrimitiveValue(value: unknown): value is string | number | boolean | null {
  return typeof value === 'string' || 
         typeof value === 'number' || 
         typeof value === 'boolean' || 
         value === null;
}

/**
 * Special data directive type guards
 */
export function isEmbedDirectiveValue(value: DataValue): value is DirectiveNode {
  return isDirectiveValue(value) && value.kind === 'add';
}

export function isRunDirectiveValue(value: DataValue): value is DirectiveNode {
  return isDirectiveValue(value) && value.kind === 'run';
}

export function isTextDirectiveValue(value: DataValue): value is DirectiveNode {
  return isDirectiveValue(value) && value.kind === 'text';
}

/**
 * Evaluation state for caching
 */
export interface EvaluationState {
  evaluated: boolean;
  result?: any;
  error?: Error;
}