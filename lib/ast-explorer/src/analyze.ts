/**
 * AST analysis utilities
 */
import type { DirectiveNode, MeldNode } from './parse.js';

/**
 * Analysis result for a node structure
 */
export interface NodeAnalysis {
  kind: string;
  subtype: string;
  valueProps: string[];
  rawProps: string[];
  metaProps: string[];
}

/**
 * Analyze the structure of an AST node
 */
export function analyzeStructure(node: DirectiveNode): NodeAnalysis {
  return {
    kind: node.kind,
    subtype: node.subtype,
    valueProps: Object.keys(node.values || {}),
    rawProps: Object.keys(node.raw || {}),
    metaProps: Object.keys(node.meta || {})
  };
}

/**
 * Determine the TypeScript type for a value
 */
export function inferType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  if (Array.isArray(value)) {
    return inferArrayType(value);
  }
  
  if (typeof value === 'object') {
    // Handle special node types
    if (value.type === 'Directive') {
      return 'DirectiveNode';
    }
    
    if (value.type === 'Text') {
      return 'TextNode';
    }
    
    if (value.type === 'VariableReference') {
      return 'VariableReferenceNode';
    }
    
    // For other object types
    return 'Record<string, any>';
  }
  
  // For primitive types
  return typeof value;
}

/**
 * Infer type for array elements
 */
function inferArrayType(arr: any[]): string {
  if (arr.length === 0) return 'any[]';
  
  // Check for common node types
  if (arr[0]?.type === 'VariableReference') {
    return 'VariableNodeArray';
  }
  
  if (arr[0]?.type === 'Text') {
    return 'ContentNodeArray';
  }
  
  if (arr[0]?.type) {
    const nodeType = arr[0].type;
    return `${nodeType}[]`;
  }
  
  // Otherwise use simple array type
  return `${inferType(arr[0])}[]`;
}

/**
 * Determine node structure differences between two nodes
 */
export function diffNodes(node1: DirectiveNode, node2: DirectiveNode): NodeDiff {
  const diff: NodeDiff = {
    kind: node1.kind !== node2.kind,
    subtype: node1.subtype !== node2.subtype,
    values: diffObjects(node1.values, node2.values),
    raw: diffObjects(node1.raw, node2.raw),
    meta: diffObjects(node1.meta, node2.meta)
  };
  
  return diff;
}

/**
 * Diff result object
 */
export interface NodeDiff {
  kind: boolean;
  subtype: boolean;
  values: ObjectDiff;
  raw: ObjectDiff;
  meta: ObjectDiff;
}

/**
 * Object difference structure
 */
export interface ObjectDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * Find differences between two objects
 */
function diffObjects(obj1: Record<string, any>, obj2: Record<string, any>): ObjectDiff {
  const keys1 = Object.keys(obj1 || {});
  const keys2 = Object.keys(obj2 || {});
  
  const added = keys2.filter(k => !keys1.includes(k));
  const removed = keys1.filter(k => !keys2.includes(k));
  const common = keys1.filter(k => keys2.includes(k));
  
  const changed = common.filter(k => {
    const val1 = obj1[k];
    const val2 = obj2[k];
    
    // Simple comparison; could be enhanced for nested structures
    if (Array.isArray(val1) && Array.isArray(val2)) {
      return val1.length !== val2.length;
    }
    
    return JSON.stringify(val1) !== JSON.stringify(val2);
  });
  
  return { added, removed, changed };
}