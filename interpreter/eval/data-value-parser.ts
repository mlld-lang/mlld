// ASTNode type no longer needed - using MlldNode from core/types
import type { 
  DataValue, 
  DataObjectValue, 
  DataArrayValue
} from '@core/types/data';
import {
  isDirectiveValue,
  isVariableReferenceValue,
  isTemplateValue,
  isPrimitiveValue 
} from '@core/types/data';
import type { 
  BaseMlldNode,
  TextNode,
  VariableReferenceNode,
  DirectiveNode,
  LiteralNode
} from '@core/types/primitives';

// Forward declaration for recursive type
interface ASTArrayNode {
  type: 'array';
  items: ASTDataNode[];
}

interface ASTObjectNode {
  type: 'object';
  properties: Record<string, ASTDataNode>;
}

// Union type for all possible AST nodes that can be passed to parseDataValue
type ASTDataNode = 
  | BaseMlldNode
  | TextNode
  | VariableReferenceNode
  | DirectiveNode
  | LiteralNode
  | (BaseMlldNode | TextNode | VariableReferenceNode | DirectiveNode | LiteralNode | string | number | boolean | null)[] // Arrays of nodes
  | { type: 'Null' } // Special null node from grammar
  | ASTArrayNode // Array AST node
  | ASTObjectNode // Object AST node
  | { type: 'primitive'; value: string | number | boolean | null } // Wrapped primitive
  | Record<string, unknown> // Plain object
  | string | number | boolean | null; // Direct primitives

/**
 * Parses an AST node into a DataValue for use in complex data assignments.
 * This handles the actual AST structure where directives, variables, and templates
 * are represented as their native node types.
 */
export function parseDataValue(node: ASTDataNode): DataValue {
  // Handle null nodes from the grammar
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'Null') {
    return null;
  }
  
  // Handle primitive values
  if (isPrimitiveValue(node)) {
    return node;
  }
  
  // Handle directive nodes (embedded directives in data)
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'Directive') {
    // The grammar marks directives in data context with meta.isDataValue
    return node as DirectiveNode; // Return the directive node directly
  }
  
  // Handle variable references
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'VariableReference') {
    return node as VariableReferenceNode; // Return the variable reference node directly
  }
  
  // Handle foreach command expressions
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'foreach-command') {
    return node as any; // Return the foreach command node directly
  }
  
  // Handle bare Text nodes (common in simple data values)
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'Text') {
    // eslint-disable-next-line mlld/no-ast-string-manipulation
    return (node as TextNode).content; // Extract the text content directly
  }
  
  // Handle template arrays (arrays containing Text/VariableReference nodes)
  if (Array.isArray(node)) {
    // Special case: single Text node arrays (common in data values)
    if (node.length === 1 && typeof node[0] === 'object' && node[0] !== null && 'type' in node[0] && node[0].type === 'Text') {
      // eslint-disable-next-line mlld/no-ast-string-manipulation
      return (node[0] as TextNode).content; // Extract the text content directly
    }
    
    // Check if this is a template array
    const hasTemplateContent = node.some(item => 
      (typeof item === 'object' && item !== null && 'type' in item) &&
      (item.type === 'Text' || 
      (item.type === 'VariableReference' && (item as VariableReferenceNode).valueType === 'varInterpolation'))
    );
    
    if (hasTemplateContent) {
      return node as (TextNode | VariableReferenceNode)[]; // Return template array directly
    }
    
    // Otherwise it's a regular data array
    return {
      type: 'array',
      items: node.map(parseDataValue)
    } as DataArrayValue;
  }
  
  // Handle array AST nodes
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'array' && 'items' in node) {
    return {
      type: 'array',
      items: (node as { type: 'array'; items: ASTDataNode[] }).items.map(parseDataValue)
    } as DataArrayValue;
  }
  
  // Handle objects
  if (typeof node === 'object' && node !== null) {
    if ('type' in node && node.type === 'object' && 'properties' in node) {
      // AST object node
      const properties: Record<string, DataValue> = {};
      for (const [key, value] of Object.entries((node as { type: 'object'; properties: Record<string, ASTDataNode> }).properties)) {
        properties[key] = parseDataValue(value);
      }
      return {
        type: 'object',
        properties
      } as DataObjectValue;
    } else if (!('type' in node)) {
      // Plain object
      const properties: Record<string, DataValue> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        properties[key] = parseDataValue(value as ASTDataNode);
      }
      return {
        type: 'object',
        properties
      } as DataObjectValue;
    }
  }
  
  // Handle wrapped primitive values from grammar
  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'primitive' && 'value' in node) {
    return (node as { type: 'primitive'; value: string | number | boolean | null }).value;
  }
  
  // If we can't identify the node type, treat it as a literal
  console.warn('Unexpected node type in data value:', node);
  return node as string;
}

// Type for the plain JavaScript values that can be extracted
type PlainValue = string | number | boolean | null | PlainObject | PlainArray;
type PlainObject = { [key: string]: PlainValue };
type PlainArray = PlainValue[];

/**
 * Extract plain value from DataValue (for simple data variables)
 */
export function extractPlainValue(value: DataValue): PlainValue {
  // Handle null nodes from the grammar
  if ((value as any)?.type === 'Null') {
    return null;
  }
  
  if (isPrimitiveValue(value)) {
    return value;
  }
  
  // Handle Text nodes (from string values in data assignments)
  if ((value as any)?.type === 'Text' && 'content' in (value as any)) {
    // eslint-disable-next-line mlld/no-ast-string-manipulation
    return (value as TextNode).content;
  }
  
  if ((value as any)?.type === 'object') {
    const obj: PlainObject = {};
    for (const [key, val] of Object.entries((value as DataObjectValue).properties)) {
      obj[key] = extractPlainValue(val);
    }
    return obj;
  }
  
  if ((value as any)?.type === 'array') {
    return ((value as DataArrayValue).items?.map(extractPlainValue) || []) as PlainArray;
  }
  
  // For other types (directives, variable references, templates), return null
  // These should be evaluated before extraction
  return null;
}

/**
 * Helper to determine if a value needs evaluation (contains unevaluated directives)
 */
export function needsEvaluation(value: DataValue): boolean {
  if (isPrimitiveValue(value)) {
    return false;
  }
  
  if (isDirectiveValue(value)) {
    return true;
  }
  
  if (isVariableReferenceValue(value)) {
    return true;
  }
  
  if (isTemplateValue(value)) {
    return true;
  }
  
  // Handle foreach command expressions
  if ((value as any)?.type === 'foreach-command') {
    return true;
  }
  
  if ((value as any)?.type === 'object') {
    return Object.values((value as DataObjectValue).properties).some(needsEvaluation);
  }
  
  if ((value as any)?.type === 'array') {
    return (value as DataArrayValue).items?.some(needsEvaluation) || false;
  }
  
  return false;
}