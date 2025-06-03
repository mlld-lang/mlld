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
  isPrimitiveValue,
  isForeachCommandExpression
} from '@core/types/data';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable, isImportVariable } from '@core/types';
import { evaluate, interpolate, resolveVariableValue } from '../core/interpreter';
import { accessField } from '../utils/field-access';
import { 
  cartesianProduct, 
  validateArrayInputs, 
  isWithinPerformanceLimit 
} from '../utils/cartesian-product';

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
      // Create a child environment to capture output without affecting the parent
      const childEnv = env.createChild();
      
      // Evaluate the directive in the child environment
      const result = await evaluate([value], childEnv);
      
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
  
  // Handle foreach command expressions
  if (isForeachCommandExpression(value)) {
    return await evaluateForeachCommand(value, env);
  }
  
  // Handle objects with type 'foreach-command' (from grammar output)
  if (value && typeof value === 'object' && value.type === 'foreach-command') {
    return await evaluateForeachCommand(value, env);
  }
  
  // Handle variable references (with potential field access)
  if (isVariableReferenceValue(value)) {
    const variable = env.getVariable(value.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${value.identifier}`);
    }
    
    // For command variables, return the variable itself (for lazy execution)
    // This preserves the command for later execution rather than executing it now
    if (variable.type === 'command') {
      return variable;
    }
    
    // Extract value using type-safe approach
    let result: any;
    if (isTextVariable(variable)) {
      result = variable.value;
    } else if (isDataVariable(variable)) {
      result = await resolveVariableValue(variable, env);
    } else if (isPathVariable(variable)) {
      result = variable.value.resolvedPath;
    } else if (isCommandVariable(variable)) {
      result = variable; // Already handled above but included for completeness
    } else if (isImportVariable(variable)) {
      result = variable.value;
    } else {
      throw new Error(`Unknown variable type in data evaluation: ${(variable as any).type}`);
    }
    
    // Apply field access if present
    if (value.fields && value.fields.length > 0) {
      // If the variable is a complex data variable that needs further evaluation
      if (variable.type === 'data' && 'isFullyEvaluated' in variable && !variable.isFullyEvaluated) {
        // For legacy complex data variables, we need to evaluate the raw value
        const complexVar = variable as any;
        result = await evaluateDataValue(complexVar.value, env);
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
  
  // Check if it's an array that needs interpolation (template content) or contains foreach
  if (Array.isArray(value)) {
    // Check if the array contains a single foreach command object
    if (value.length === 1 && value[0] && typeof value[0] === 'object' && value[0].type === 'foreach-command') {
      return await evaluateForeachCommand(value[0], env);
    }
    
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
  
  // Handle direct foreach structure from grammar 
  if (value && typeof value === 'object' && value.type === 'foreach-command') {
    return await evaluateForeachCommand(value, env);
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

/**
 * Evaluates a foreach command expression by iterating over arrays with a parameterized command.
 * 
 * @param foreachExpr - The foreach command expression to evaluate
 * @param env - The evaluation environment
 * @returns Array of results from command execution
 */
async function evaluateForeachCommand(
  foreachExpr: any, // Use any for now since the grammar output structure might not match exactly
  env: Environment
): Promise<any[]> {
  const { command, arrays } = foreachExpr.value || foreachExpr;
  
  // 1. Resolve the command variable
  const cmdVariable = env.getVariable(command.identifier);
  if (!cmdVariable) {
    throw new Error(`Command not found: ${command.identifier}`);
  }
  
  if (!isCommandVariable(cmdVariable) && cmdVariable.type !== 'textTemplate') {
    throw new Error(`Variable ${command.identifier} is not a command or text template. Got type: ${cmdVariable.type}`);
  }
  
  // 2. Evaluate all array arguments
  const evaluatedArrays: any[][] = [];
  for (let i = 0; i < arrays.length; i++) {
    const arrayVar = arrays[i];
    const arrayValue = await evaluateDataValue(arrayVar, env);
    
    if (!Array.isArray(arrayValue)) {
      throw new Error(`Argument ${i + 1} to foreach must be an array, got ${typeof arrayValue}`);
    }
    
    evaluatedArrays.push(arrayValue);
  }
  
  // 3. Validate array inputs and performance limits
  validateArrayInputs(evaluatedArrays);
  
  if (!isWithinPerformanceLimit(evaluatedArrays)) {
    const totalCombinations = evaluatedArrays.reduce((total, arr) => total * arr.length, 1);
    throw new Error(`Foreach operation would generate ${totalCombinations} combinations, which exceeds the performance limit. Consider reducing array sizes or using more specific filtering.`);
  }
  
  // 4. Check parameter count matches array count
  const paramCount = cmdVariable.value.paramNames?.length || cmdVariable.value.params?.length || 0;
  if (evaluatedArrays.length !== paramCount) {
    throw new Error(`Command ${command.identifier} expects ${paramCount} parameters, got ${evaluatedArrays.length} arrays`);
  }
  
  // 5. Generate cartesian product
  const tuples = cartesianProduct(evaluatedArrays);
  
  // 6. Execute command for each tuple
  const results: any[] = [];
  for (let i = 0; i < tuples.length; i++) {
    const tuple = tuples[i];
    
    try {
      // Create argument map for parameter substitution
      const argMap: Record<string, any> = {};
      const params = cmdVariable.value.paramNames || cmdVariable.value.params || [];
      params.forEach((param: string, index: number) => {
        argMap[param] = tuple[index];
      });
      
      // Invoke the parameterized command with arguments
      const result = await invokeParameterizedCommand(cmdVariable, argMap, env);
      results.push(result);
    } catch (error) {
      // Include iteration context in error message
      const params = cmdVariable.value.paramNames || cmdVariable.value.params || [];
      const iterationContext = params.map((param: string, index: number) => 
        `${param}: ${JSON.stringify(tuple[index])}`
      ).join(', ');
      
      throw new Error(
        `Error in foreach iteration ${i + 1} (${iterationContext}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return results;
}

/**
 * Invokes a parameterized command (exec or text template) with given arguments.
 * 
 * @param cmdVariable - The command variable to invoke
 * @param argMap - Map of parameter names to argument values  
 * @param env - The evaluation environment
 * @returns The result of command execution
 */
async function invokeParameterizedCommand(
  cmdVariable: any,
  argMap: Record<string, any>,
  env: Environment
): Promise<any> {
  // Create a child environment with parameter bindings
  const childEnv = env.createChild();
  
  // Bind arguments to parameter names
  for (const [paramName, paramValue] of Object.entries(argMap)) {
    // Create appropriate variable type based on the parameter value
    if (typeof paramValue === 'string') {
      childEnv.setVariable(paramName, {
        type: 'text',
        name: paramName,
        value: paramValue,
        definedAt: null
      });
    } else {
      childEnv.setVariable(paramName, {
        type: 'data',
        name: paramName,
        value: paramValue,
        definedAt: null,
        isFullyEvaluated: true
      });
    }
  }
  
  const commandDef = cmdVariable.value;
  
  if (commandDef.type === 'command') {
    // Execute command template with bound parameters
    const command = await interpolate(commandDef.commandTemplate, childEnv);
    return await env.executeCommand(command);
  } else if (commandDef.type === 'code') {
    // Execute code template with bound parameters
    const code = await interpolate(commandDef.codeTemplate, childEnv);
    return await env.executeCode(code, commandDef.language);
  } else if (commandDef.type === 'textTemplate') {
    // Execute text template with bound parameters
    const text = await interpolate(commandDef.content, childEnv);
    return text;
  } else {
    throw new Error(`Unsupported command type: ${commandDef.type}`);
  }
}

/**
 * Validates a foreach expression without executing it.
 * This is called during data directive evaluation to provide early error feedback.
 * 
 * @param foreachExpr - The foreach expression to validate
 * @param env - The evaluation environment
 * @throws Error if validation fails
 */
export async function validateForeachExpression(
  foreachExpr: any,
  env: Environment
): Promise<void> {
  const { command, arrays } = foreachExpr.value || foreachExpr;
  
  // 1. Check if command exists
  const cmdVariable = env.getVariable(command.identifier);
  if (!cmdVariable) {
    throw new Error(`Command not found: ${command.identifier}`);
  }
  
  if (!isCommandVariable(cmdVariable) && cmdVariable.type !== 'textTemplate') {
    throw new Error(`Variable ${command.identifier} is not a command or text template. Got type: ${cmdVariable.type}`);
  }
  
  // 2. Validate array count matches parameter count
  const paramCount = cmdVariable.value.paramNames?.length || cmdVariable.value.params?.length || 0;
  if (arrays.length !== paramCount) {
    throw new Error(`Command ${command.identifier} expects ${paramCount} parameters, got ${arrays.length} arrays`);
  }
  
  // Note: We don't evaluate the arrays here as they might contain variables
  // that aren't defined yet. Full validation happens during lazy evaluation.
}