import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';

/**
 * Evaluate @data directives.
 * The simplest evaluator - data is already parsed in the AST.
 * 
 * Ported from DataDirectiveHandler.
 */
export async function evaluateData(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Data directive missing identifier');
  }
  
  // Data is already parsed in the AST!
  // Value can be either an array element or a direct object/array
  let value = directive.values?.value;
  if (Array.isArray(value)) {
    value = value[0];
  }
  if (value === undefined) {
    throw new Error('Data directive missing value');
  }
  
  // Recursively handle parsed objects and arrays
  function extractValue(val: any): any {
    if (typeof val === 'object' && val !== null) {
      if (val.type === 'object' && val.properties) {
        // Extract nested objects
        const result: any = {};
        for (const [key, nestedVal] of Object.entries(val.properties)) {
          result[key] = extractValue(nestedVal);
        }
        return result;
      } else if (val.type === 'array' && (val.elements || val.items)) {
        // Extract arrays
        const items = val.elements || val.items;
        return items.map((item: any) => extractValue(item));
      }
    }
    return val;
  }
  
  value = extractValue(value);
  
  // Handle field access in identifier (e.g., greeting.text)
  const parts = identifier.split('.');
  const varName = parts[0];
  
  if (parts.length === 1) {
    // Simple variable
    const variable = {
      type: 'data' as const,
      name: varName,
      value: value
    };
    env.setVariable(varName, variable);
  } else {
    // Nested field access - need to build up the object structure
    let obj: any = {};
    let current = obj;
    
    for (let i = 1; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    
    // Check if variable already exists
    const existing = env.getVariable(varName);
    if (existing && existing.type === 'data') {
      // Merge with existing object
      Object.assign(existing.value, obj);
    } else {
      // Create new variable
      const variable = {
        type: 'data' as const,
        name: varName,
        value: obj
      };
      env.setVariable(varName, variable);
    }
  }
  
  // Return the parsed value
  return { value, env };
}