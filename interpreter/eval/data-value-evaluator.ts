import type { Environment } from '../env/Environment';
import type { 
  DataValue,
  DataObject,
  DataArray,
  EvaluationState
} from '@core/types/data';
import { 
  isDirectiveValue,
  isVariableReferenceValue,
  isTemplateValue,
  isPrimitiveValue
} from '@core/types/data';
import { evaluate, interpolate } from '../core/interpreter';
import { accessField } from '../utils/field-access';

/**
 * Cache for evaluated directives to avoid re-evaluation
 */
const evaluationCache = new Map<any, EvaluationState>();

/**
 * Evaluates a DataValue, recursively evaluating any embedded directives,
 * variable references, or templates.
 */
export async function evaluateDataValue(
  value: DataValue,
  env: Environment
): Promise<any> {
  // Primitive values pass through unchanged
  if (isPrimitiveValue(value)) {
    return value;
  }
  
  // Handle embedded directives
  if (isDirectiveValue(value)) {
    // Check if we've already evaluated this directive
    const cached = evaluationCache.get(value);
    if (cached?.evaluated && !cached.error) {
      return cached.result;
    }
    
    try {
      // Evaluate the directive in the current environment
      const result = await evaluate([value], env);
      
      // For run and add directives in data context, trim trailing newlines
      let finalValue = result.value;
      if ((value.kind === 'run' || value.kind === 'add') && typeof finalValue === 'string') {
        finalValue = finalValue.replace(/\n+$/, '');
      }
      
      // Cache the result
      const state: EvaluationState = {
        evaluated: true,
        result: finalValue,
        error: undefined
      };
      evaluationCache.set(value, state);
      
      return finalValue;
    } catch (error) {
      // Cache the error
      const state: EvaluationState = {
        evaluated: true,
        result: undefined,
        error: error as Error
      };
      evaluationCache.set(value, state);
      throw error;
    }
  }
  
  // Handle variable references (with potential field access)
  if (isVariableReferenceValue(value)) {
    const variable = env.getVariable(value.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${value.identifier}`);
    }
    
    let result = variable.value;
    
    // Apply field access if present
    if (value.fields && value.fields.length > 0) {
      // If the variable is a complex data variable, we need to evaluate it first
      if (variable.type === 'data' && 'isFullyEvaluated' in variable && !variable.isFullyEvaluated) {
        result = await evaluateDataValue(variable.value, env);
      }
      
      for (const field of value.fields) {
        result = accessField(result, field);
      }
    }
    
    return result;
  }
  
  // Handle template interpolation
  if (isTemplateValue(value)) {
    return await interpolate(value, env);
  }
  
  // Handle objects - recursively evaluate all properties
  if (value?.type === 'object') {
    const evaluatedObj: Record<string, any> = {};
    
    for (const [key, propValue] of Object.entries(value.properties)) {
      try {
        evaluatedObj[key] = await evaluateDataValue(propValue, env);
      } catch (error) {
        // Store error information but continue evaluating other properties
        evaluatedObj[key] = {
          __error: true,
          __message: error instanceof Error ? error.message : String(error),
          __property: key
        };
      }
    }
    
    return evaluatedObj;
  }
  
  // Handle arrays - evaluate all elements
  if (value?.type === 'array') {
    const evaluatedElements: any[] = [];
    
    for (let i = 0; i < value.items.length; i++) {
      try {
        evaluatedElements.push(await evaluateDataValue(value.items[i], env));
      } catch (error) {
        // Store error information but continue evaluating other elements
        evaluatedElements.push({
          __error: true,
          __message: error instanceof Error ? error.message : String(error),
          __index: i
        });
      }
    }
    
    return evaluatedElements;
  }
  
  // Check if it's an array that needs interpolation (template content)
  if (Array.isArray(value)) {
    // Check if all elements are Text or VariableReference nodes
    const isTemplateContent = value.every(item => 
      item?.type === 'Text' || item?.type === 'VariableReference'
    );
    
    if (isTemplateContent) {
      // This is template content that needs interpolation
      return await interpolate(value, env);
    }
    
    // Otherwise it's a regular array that should have been handled above
    console.warn('Unhandled array in evaluateDataValue:', value);
    return value;
  }
  
  // Fallback - return the value as-is
  console.warn('Unexpected value type in evaluateDataValue:', value);
  return value;
}

/**
 * Checks if a data value has been fully evaluated (no unevaluated directives remain)
 */
export function isFullyEvaluated(value: DataValue): boolean {
  if (isPrimitiveValue(value)) {
    return true;
  }
  
  if (isDirectiveValue(value)) {
    const cached = evaluationCache.get(value);
    return cached?.evaluated === true;
  }
  
  if (isVariableReferenceValue(value) || isTemplateValue(value)) {
    return false; // These always need evaluation
  }
  
  if (value?.type === 'object') {
    return Object.values(value.properties).every(isFullyEvaluated);
  }
  
  if (value?.type === 'array') {
    return value.elements.every(isFullyEvaluated);
  }
  
  return true;
}

/**
 * Collects any evaluation errors from a data value
 */
export function collectEvaluationErrors(
  value: any,
  path: string = ''
): Record<string, Error> {
  const errors: Record<string, Error> = {};
  
  if (value?.__error) {
    errors[path] = new Error(value.__message);
    return errors;
  }
  
  if (typeof value === 'object' && value !== null) {
    for (const [key, propValue] of Object.entries(value)) {
      const propPath = path ? `${path}.${key}` : key;
      Object.assign(errors, collectEvaluationErrors(propValue, propPath));
    }
  }
  
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const elemPath = `${path}[${i}]`;
      Object.assign(errors, collectEvaluationErrors(value[i], elemPath));
    }
  }
  
  return errors;
}