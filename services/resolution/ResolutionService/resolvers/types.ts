import type { MeldNode } from '@core/syntax/types.js';

/**
 * Represents a field access in a variable reference
 * Examples: object.field, array[0]
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * Text node containing static content
 */
export interface TextNode extends MeldNode {
  type: 'Text';
  value: string; 
  content?: string; // Support legacy property name
}

/**
 * Base node type for variable references
 */
export interface VariableReferenceNode extends MeldNode {
  type: 'VariableReference';
  identifier: string;
  fields?: Field[];
  isVariableReference: boolean;
}

/**
 * Text variable reference (previously ${var})
 */
export interface TextVarNode extends VariableReferenceNode {
  valueType?: 'text';
}

/**
 * Data variable reference (previously #{data})
 */
export interface DataVarNode extends VariableReferenceNode {
  valueType?: 'data';
}

/**
 * Directive node (@directive)
 */
export interface DirectiveNode extends MeldNode {
  type: 'Directive';
  directive: {
    kind: string;
    identifier: string;
    value?: string;
    [key: string]: any;
  };
}

/**
 * Type guard for text nodes
 */
export function isTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text';
}

/**
 * Type guard for variable reference nodes
 */
export function isVariableReferenceNode(node: MeldNode): node is VariableReferenceNode {
  return node.type === 'VariableReference';
}

/**
 * Type guard for text variable nodes
 */
export function isTextVarNode(node: MeldNode): node is TextVarNode {
  return node.type === 'VariableReference' && (!('valueType' in node) || (node as any).valueType === 'text');
}

/**
 * Type guard for data variable nodes
 */
export function isDataVarNode(node: MeldNode): node is DataVarNode {
  return node.type === 'VariableReference' && 'valueType' in node && (node as any).valueType === 'data';
}

/**
 * Type guard for directive nodes
 */
export function isDirectiveNode(node: MeldNode): node is DirectiveNode {
  return node.type === 'Directive';
}