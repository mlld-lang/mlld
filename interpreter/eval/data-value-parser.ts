// ASTNode type no longer needed - using MlldNode from core/types
import type { 
  DataValue, 
  DataObject, 
  DataArray
} from '@core/types/data';
import {
  isDirectiveValue,
  isVariableReferenceValue,
  isTemplateValue,
  isPrimitiveValue 
} from '@core/types/data';

/**
 * Parses an AST node into a DataValue for use in complex data assignments.
 * This handles the actual AST structure where directives, variables, and templates
 * are represented as their native node types.
 */
export function parseDataValue(node: any): DataValue {
  // Handle null nodes from the grammar
  if (node?.type === 'Null') {
    return null;
  }
  
  // Handle primitive values
  if (isPrimitiveValue(node)) {
    return node;
  }
  
  // Handle directive nodes (embedded directives in data)
  if (node?.type === 'Directive') {
    // The grammar marks directives in data context with meta.isDataValue
    return node; // Return the directive node directly
  }
  
  // Handle variable references
  if (node?.type === 'VariableReference') {
    return node; // Return the variable reference node directly
  }
  
  // Handle bare Text nodes (common in simple data values)
  if (node?.type === 'Text') {
    return node.content; // Extract the text content directly
  }
  
  // Handle template arrays (arrays containing Text/VariableReference nodes)
  if (Array.isArray(node)) {
    // Special case: single Text node arrays (common in data values)
    if (node.length === 1 && node[0]?.type === 'Text') {
      return node[0].content; // Extract the text content directly
    }
    
    // Check if this is a template array
    const hasTemplateContent = node.some(item => 
      item?.type === 'Text' || 
      (item?.type === 'VariableReference' && item?.valueType === 'varInterpolation')
    );
    
    if (hasTemplateContent) {
      return node; // Return template array directly
    }
    
    // Otherwise it's a regular data array
    return {
      type: 'array',
      items: node.map(parseDataValue)
    };
  }
  
  // Handle array AST nodes
  if (node?.type === 'array' && node.items) {
    return {
      type: 'array',
      items: node.items.map(parseDataValue)
    };
  }
  
  // Handle objects
  if (node?.type === 'object' || (typeof node === 'object' && node !== null && !node.type)) {
    const properties: Record<string, DataValue> = {};
    
    // Handle both AST object nodes and plain objects
    const props = node.properties || node;
    
    for (const [key, value] of Object.entries(props)) {
      properties[key] = parseDataValue(value);
    }
    
    return {
      type: 'object',
      properties
    };
  }
  
  // Handle wrapped primitive values from grammar
  if (node?.type === 'primitive' && 'value' in node) {
    return node.value;
  }
  
  // If we can't identify the node type, treat it as a literal
  console.warn('Unexpected node type in data value:', node);
  return node;
}

/**
 * Extract plain value from DataValue (for simple data variables)
 */
export function extractPlainValue(value: DataValue): any {
  // Handle null nodes from the grammar
  if (value?.type === 'Null') {
    return null;
  }
  
  if (isPrimitiveValue(value)) {
    return value;
  }
  
  // Handle Text nodes (from string values in data assignments)
  if (value?.type === 'Text' && 'content' in value) {
    return value.content;
  }
  
  if (value?.type === 'object') {
    const obj: any = {};
    for (const [key, val] of Object.entries(value.properties)) {
      obj[key] = extractPlainValue(val);
    }
    return obj;
  }
  
  if (value?.type === 'array') {
    return value.items?.map(extractPlainValue) || [];
  }
  
  // For other types, return as-is
  return value;
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
  
  if (value?.type === 'object') {
    return Object.values(value.properties).some(needsEvaluation);
  }
  
  if (value?.type === 'array') {
    return value.items?.some(needsEvaluation) || false;
  }
  
  return false;
}