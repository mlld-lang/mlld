import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { parseDataValue, needsEvaluation, extractPlainValue } from './data-value-parser';
import { createDataVariable, createComplexDataVariable, astLocationToSourceLocation } from '@core/types';
import { validateForeachExpression } from './data-value-evaluator';

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
  // Extract identifier - this is a variable name, not content to interpolate
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Data directive missing identifier');
  }
  
  // For assignment directives, extract the variable name
  const identifierNode = identifierNodes[0];
  let identifier: string;
  
  if (identifierNode.type === 'Text' && 'content' in identifierNode) {
    identifier = (identifierNode as TextNode).content;
  } else if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = (identifierNode as any).identifier;
  } else {
    throw new Error('Data directive identifier must be a simple variable name');
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
  
  // Validate foreach expressions early to provide immediate feedback
  if (dataValue && typeof dataValue === 'object' && dataValue.type === 'foreach-command') {
    await validateForeachExpression(dataValue, env);
  }
  
  // Check if this data contains any complex values that need evaluation
  const isComplex = needsEvaluation(dataValue);
  
  // Handle field access in identifier (e.g., greeting.text)
  const parts = identifier.split('.');
  const varName = parts[0];
  
  if (parts.length === 1) {
    // Simple variable assignment
    if (isComplex) {
      // Create a complex data variable that supports lazy evaluation
      const variable = createComplexDataVariable(varName, dataValue, {
        definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
      });
      env.setVariable(varName, variable);
    } else {
      // Create a simple data variable for primitive/static values
      // Extract the plain value for simple data
      const plainValue = extractPlainValue(dataValue);
      const variable = createDataVariable(varName, plainValue, {
        definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
      });
      env.setVariable(varName, variable);
    }
  } else {
    // Nested field access - build up the object structure
    // For example: @data greeting.text = "Hello"
    const parts = identifier.split('.');
    const rootName = parts[0];
    
    // Get or create the root object
    let rootVar = env.getVariable(rootName);
    let rootValue: any;
    
    if (!rootVar) {
      // Create new root object
      rootValue = {};
      rootVar = createDataVariable(rootName, rootValue, {
        definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
      });
      env.setVariable(rootName, rootVar);
    } else if (rootVar.type !== 'data') {
      throw new Error(`Variable ${rootName} is not a data variable, cannot assign field`);
    } else {
      // Get existing value and ensure it's an object
      rootValue = rootVar.value;
      if (typeof rootValue !== 'object' || rootValue === null) {
        throw new Error(`Variable ${rootName} is not an object, cannot assign field`);
      }
    }
    
    // Navigate to the nested field and create objects as needed
    let current = rootValue;
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Set the final field value
    const lastField = parts[parts.length - 1];
    
    // Determine if this contains lazy-evaluated content
    if (needsEvaluation(dataValue)) {
      // Store as ComplexDataVariable for lazy evaluation
      const complexVariable = createComplexDataVariable(identifier, dataValue);
      current[lastField] = dataValue; // Store the raw DataValue
      
      // Update the root variable in-place (don't redefine it)
      rootVar.value = rootValue;
    } else {
      // Simple value - extract and store directly
      const plainValue = extractPlainValue(dataValue);
      current[lastField] = plainValue;
      
      // Update the root variable in-place (don't redefine it)
      rootVar.value = rootValue;
    }
  }
  
  // Data directives produce no output
  return { value: '', env };
}