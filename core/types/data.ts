import type { DirectiveNode, VariableReferenceNode, ASTNode, TextNode } from './ast-nodes';

// Since the AST uses actual nodes rather than wrapper types, we work with those directly
export type DataValue = 
  | string
  | number 
  | boolean
  | null
  | DirectiveNode     // Has meta.isDataValue = true
  | VariableReferenceNode  // Has valueType: 'varIdentifier'
  | TemplateArray     // Array of Text/VariableReference nodes
  | DataObject
  | DataArray;

// Template content is represented as an array of nodes
export type TemplateArray = Array<TextNode | VariableReferenceNode>;

export interface DataObject {
  type: 'object';
  properties: Record<string, DataValue>;
}

export interface DataArray {
  type: 'array';
  elements: DataValue[];
}

// Helper type guards based on actual AST structure
export function isDirectiveValue(value: any): value is DirectiveNode {
  return value?.type === 'Directive' && value?.meta?.isDataValue === true;
}

export function isVariableReferenceValue(value: any): value is VariableReferenceNode {
  return value?.type === 'VariableReference' && value?.valueType === 'varIdentifier';
}

export function isTemplateValue(value: any): value is TemplateArray {
  return Array.isArray(value) && value.some(node => 
    node?.type === 'VariableReference' && node?.valueType === 'varInterpolation'
  );
}

export function isDataObject(value: any): value is DataObject {
  return value?.type === 'object';
}

export function isDataArray(value: any): value is DataArray {
  return value?.type === 'array';
}

export function isPrimitiveValue(value: any): boolean {
  return typeof value === 'string' || 
         typeof value === 'number' || 
         typeof value === 'boolean' || 
         value === null;
}

// For tracking evaluation state of embedded directives
export interface EvaluationState {
  evaluated: boolean;
  result?: any;
  error?: Error;
}

// Track evaluation state separately from AST nodes
export const evaluationCache = new WeakMap<DirectiveNode, EvaluationState>();