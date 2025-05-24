import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { DataValue } from '@core/types/data';
import { isDirectiveValue, isVariableReferenceValue, isTemplateValue } from '@core/types/data';
import { evaluate } from '../core/interpreter';

// Simple cache to prevent double evaluation of the same directive
const evaluationCache = new WeakMap<DirectiveNode, any>();

/**
 * Evaluate embedded directives within a data value.
 * This handles lazy evaluation of directives stored in data variables.
 */
export async function evaluateDataValue(
  value: DataValue,
  env: Environment
): Promise<any> {
  // Handle primitive values - no evaluation needed
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  
  // Handle directive nodes (both marked as data values and regular directives)
  if (value?.type === 'Directive') {
    const directive = value as DirectiveNode;
    
    // Check cache first
    if (evaluationCache.has(directive)) {
      return evaluationCache.get(directive);
    }
    
    // Evaluate the directive and return its output
    const result = await evaluate(directive, env);
    const resultValue = result.value || '';
    
    // Cache the result
    evaluationCache.set(directive, resultValue);
    
    return resultValue;
  }
  
  // Handle variable references (should be resolved by interpolation)
  if (isVariableReferenceValue(value)) {
    // This shouldn't happen in lazy evaluation context
    // Variable references should be resolved before storage
    throw new Error('Unexpected variable reference in lazy evaluation');
  }
  
  // Handle template values (arrays with Text/VariableReference nodes)
  if (isTemplateValue(value)) {
    // Templates should be interpolated before storage
    throw new Error('Unexpected template value in lazy evaluation');
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    const evaluatedArray = [];
    for (const item of value) {
      evaluatedArray.push(await evaluateDataValue(item, env));
    }
    return evaluatedArray;
  }
  
  // Handle DataArray type
  if (value?.type === 'array' && 'elements' in value) {
    const evaluatedArray = [];
    for (const element of value.elements) {
      evaluatedArray.push(await evaluateDataValue(element, env));
    }
    return evaluatedArray;
  }
  
  // Handle DataObject type
  if (value?.type === 'object' && 'properties' in value) {
    const evaluatedObject: Record<string, any> = {};
    for (const [key, propValue] of Object.entries(value.properties)) {
      evaluatedObject[key] = await evaluateDataValue(propValue, env);
    }
    return evaluatedObject;
  }
  
  // Handle plain objects (from parsed data)
  if (typeof value === 'object' && value !== null && !value.type) {
    const evaluatedObject: Record<string, any> = {};
    for (const [key, propValue] of Object.entries(value)) {
      evaluatedObject[key] = await evaluateDataValue(propValue, env);
    }
    return evaluatedObject;
  }
  
  // If we get here, it's an unhandled type
  console.warn('Unhandled data value type in lazy evaluation:', value);
  return value;
}

/**
 * Check if a data value contains any unevaluated directives
 */
export function hasUnevaluatedDirectives(value: DataValue): boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return false;
  }
  
  if (value?.type === 'Directive') {
    return true;
  }
  
  if (Array.isArray(value)) {
    return value.some(hasUnevaluatedDirectives);
  }
  
  if (value?.type === 'array' && 'elements' in value) {
    return value.elements.some(hasUnevaluatedDirectives);
  }
  
  if (value?.type === 'object' && 'properties' in value) {
    return Object.values(value.properties).some(hasUnevaluatedDirectives);
  }
  
  if (typeof value === 'object' && value !== null && !value.type) {
    return Object.values(value).some(hasUnevaluatedDirectives);
  }
  
  return false;
}