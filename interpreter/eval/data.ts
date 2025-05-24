import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { parseDataValue, needsEvaluation, extractPlainValue } from './data-value-parser';
import { createDataVariable, createComplexDataVariable } from '@core/types/variables';

/**
 * Evaluate @data directives.
 * Now supports complex data with embedded directives, variable references, and templates.
 * 
 * Ported from DataDirectiveHandler with complex data support.
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
  let rawValue = directive.values?.value;
  if (Array.isArray(rawValue) && rawValue.length === 1) {
    rawValue = rawValue[0];
  }
  if (rawValue === undefined) {
    throw new Error('Data directive missing value');
  }
  
  // Parse the value into our DataValue structure
  const dataValue = parseDataValue(rawValue);
  
  // Check if this data contains any complex values that need evaluation
  const isComplex = needsEvaluation(dataValue);
  
  // Handle field access in identifier (e.g., greeting.text)
  const parts = identifier.split('.');
  const varName = parts[0];
  
  if (parts.length === 1) {
    // Simple variable assignment
    if (isComplex) {
      // Create a complex data variable that supports lazy evaluation
      const variable = createComplexDataVariable(varName, dataValue);
      env.setVariable(varName, variable);
    } else {
      // Create a simple data variable for primitive/static values
      // Extract the plain value for simple data
      const plainValue = extractPlainValue(dataValue);
      const variable = createDataVariable(varName, plainValue);
      env.setVariable(varName, variable);
    }
  } else {
    // Nested field access - need to build up the object structure
    // For complex data, we need to handle this differently
    throw new Error(
      'Field access in @data identifier not yet supported with complex values. ' +
      'Use a simple identifier and access fields when referencing the variable.'
    );
  }
  
  // Data directives produce no output
  return { value: '', env };
}