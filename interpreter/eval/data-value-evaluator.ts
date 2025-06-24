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
  isForeachCommandExpression,
  isForeachSectionExpression
} from '@core/types/data';
import { isTextVariable, isDataVariable, isPathVariable, isImportVariable, isExecutableVariable } from '@core/types';
import { isExecutable as isExecutableVar } from '@core/types/variable';
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
  
  // Handle Text nodes
  if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
    return value.content;
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
  
  if (isForeachSectionExpression(value)) {
    return await evaluateForeachSection(value, env);
  }
  
  // Handle objects with type 'foreach-section' (from grammar output)
  if (value && typeof value === 'object' && value.type === 'foreach-section') {
    return await evaluateForeachSection(value, env);
  }
  
  // Handle variable references with tail modifiers (pipelines, etc.)
  if (value && typeof value === 'object' && value.type === 'VariableReferenceWithTail') {
    // First resolve the variable value
    const varRef = value.variable;
    const variable = env.getVariable(varRef.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${varRef.identifier}`);
    }
    
    // Get the base value
    let result: any;
    if (isTextVariable(variable)) {
      result = variable.value;
    } else if (isDataVariable(variable)) {
      result = await resolveVariableValue(variable, env);
    } else if (isPathVariable(variable)) {
      result = variable.value.resolvedPath;
    } else if (isExecutableVariable(variable)) {
      // If we have a pipeline, we need to execute the variable to get its value
      if (value.withClause && value.withClause.pipeline) {
        // Execute the function to get its result
        const { evaluateExecInvocation } = await import('./exec-invocation');
        result = await evaluateExecInvocation({
          type: 'ExecInvocation',
          identifier: varRef.identifier,
          args: [],
          withClause: null
        } as any, env);
      } else {
        // For non-pipeline cases, return the variable for lazy evaluation
        result = variable;
      }
    } else if (isImportVariable(variable)) {
      result = variable.value;
    } else if (variable.type === 'array') {
      // Handle new array variable type
      result = variable.value;
    } else if (variable.type === 'object') {
      // Handle new object variable type
      result = variable.value;
    } else {
      throw new Error(`Unknown variable type in data evaluation: ${(variable as any).type}`);
    }
    
    // Apply field access if present
    if (varRef.fields && varRef.fields.length > 0) {
      result = await accessField(result, varRef.fields, varRef.identifier);
    }
    
    // Apply pipeline if present
    if (value.withClause && value.withClause.pipeline) {
      const { executePipeline } = await import('../eval/pipeline');
      
      // Extract format from with clause if specified
      const format = value.withClause.format as string | undefined;
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('Before pipeline:', { result, stringified: String(result), format });
      }
      
      // Convert result to string properly - JSON.stringify for objects/arrays
      const stringResult = typeof result === 'string' ? result : JSON.stringify(result);
      
      const pipelineResult = await executePipeline(
        stringResult,
        value.withClause.pipeline,
        env,
        undefined, // location
        format
      );
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('After pipeline:', { 
          pipelineResult,
          pipelineResultType: typeof pipelineResult,
          pipelineResultIsNull: pipelineResult === null,
          pipelineResultIsUndefined: pipelineResult === undefined
        });
      }
      
      result = pipelineResult;
    }
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('VariableReferenceWithTail final result:', {
        variableIdentifier: varRef.identifier,
        resultValue: result,
        resultType: typeof result,
        resultIsNull: result === null,
        resultIsUndefined: result === undefined
      });
    }
    
    return result;
  }
  
  // Handle variable references (with potential field access)
  if (isVariableReferenceValue(value)) {
    const variable = env.getVariable(value.identifier);
    if (!variable) {
      throw new Error(`Variable not found: ${value.identifier}`);
    }
    
    // For executable variables, return the variable itself (for lazy execution)
    // This preserves the executable for later execution rather than executing it now
    if (isExecutableVar(variable)) {
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
    } else if (isExecutableVariable(variable)) {
      result = variable; // Already handled above but included for completeness
    } else if (isImportVariable(variable)) {
      result = variable.value;
    } else if (variable.type === 'array') {
      // Handle new array variable type
      result = variable.value;
    } else if (variable.type === 'object') {
      // Handle new object variable type
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
    
    // Otherwise it's a regular array that's already been processed
    // This can happen when foreach-section returns an array of strings
    return value;
  }
  
  // Handle direct foreach structure from grammar 
  if (value && typeof value === 'object' && value.type === 'foreach-command') {
    return await evaluateForeachCommand(value, env);
  }
  
  // Handle ExecInvocation nodes
  if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
    const { evaluateExecInvocation } = await import('./exec-invocation');
    
    // If the ExecInvocation has a pipeline, we need to handle it here
    // to ensure proper data type handling
    if (value.withClause && value.withClause.pipeline) {
      // Create a copy without the withClause to avoid double execution
      const nodeWithoutPipeline = {
        ...value,
        withClause: null
      };
      
      const result = await evaluateExecInvocation(nodeWithoutPipeline as any, env);
      
      const { executePipeline } = await import('../eval/pipeline');
      
      // Get the string representation of the result for the pipeline
      const stringResult = typeof result.value === 'string' ? result.value : JSON.stringify(result.value);
      
      // Extract format from with clause if specified
      const format = value.withClause.format as string | undefined;
      
      // Execute the pipeline with the stringified result and format
      const pipelineResult = await executePipeline(
        stringResult,
        value.withClause.pipeline,
        env,
        undefined, // location
        format
      );
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('ExecInvocation pipeline result:', {
          pipelineResult,
          pipelineResultType: typeof pipelineResult,
          isPipelineInput: !!(pipelineResult && typeof pipelineResult === 'object' && 'text' in pipelineResult)
        });
      }
      
      // Try to parse the pipeline result back to maintain type consistency
      try {
        const parsed = JSON.parse(pipelineResult);
        return parsed;
      } catch {
        // If JSON parsing fails, return the string as-is
        return pipelineResult;
      }
    }
    
    // No pipeline, execute normally
    const result = await evaluateExecInvocation(value as any, env);
    
    // If the result is a JSON string, try to parse it back into an object/array
    if (typeof result.value === 'string') {
      try {
        const parsed = JSON.parse(result.value);
        return parsed;
      } catch {
        // If JSON parsing fails, return the string as-is
        return result.value;
      }
    }
    
    return result.value;
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
export async function evaluateForeachCommand(
  foreachExpr: any, // Use any for now since the grammar output structure might not match exactly
  env: Environment
): Promise<any[]> {
  const { command, arrays } = foreachExpr.value || foreachExpr;
  
  // 1. Resolve the command variable
  const cmdVariable = env.getVariable(command.identifier);
  if (!cmdVariable) {
    throw new Error(`Command not found: ${command.identifier}`);
  }
  
  if (!isExecutableVariable(cmdVariable)) {
    throw new Error(`Variable '${command.identifier}' cannot be used with foreach. Expected an @exec command or @text template with parameters, but got type: ${cmdVariable.type}`);
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
  const definition = cmdVariable.value;
  // For ExecutableVariable, paramNames is on the variable itself, not in value
  const paramCount = cmdVariable.paramNames?.length || definition.paramNames?.length || 0;
  if (evaluatedArrays.length !== paramCount) {
    const paramType = definition.sourceDirective === 'text' ? 'Text template' : 'Command';
    throw new Error(`${paramType} '${command.identifier}' expects ${paramCount} parameter${paramCount !== 1 ? 's' : ''}, but foreach is passing ${evaluatedArrays.length} array${evaluatedArrays.length !== 1 ? 's' : ''}`);
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
      // For ExecutableVariable, paramNames is on the variable itself
      const params = cmdVariable.paramNames || definition.paramNames || [];
      params.forEach((param: string, index: number) => {
        argMap[param] = tuple[index];
      });
      
      // Invoke the parameterized command with arguments
      const result = await invokeParameterizedCommand(cmdVariable, argMap, env);
      results.push(result);
    } catch (error) {
      // Include iteration context in error message
      const params = cmdVariable.paramNames || definition.paramNames || [];
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
  
  // Import variable creation functions
  const { createSimpleTextVariable, createObjectVariable, createArrayVariable } = await import('@core/types/variable');
  const { VariableSource } = await import('@core/types/variable');
  
  // Create default source for parameter variables
  const paramSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted',
    hasInterpolation: false,
    isMultiLine: false
  };
  
  // Bind arguments to parameter names
  for (const [paramName, paramValue] of Object.entries(argMap)) {
    // Create appropriate variable type based on the parameter value
    if (typeof paramValue === 'string') {
      const variable = createSimpleTextVariable(paramName, paramValue, paramSource, { isParameter: true });
      childEnv.setParameterVariable(paramName, variable);
    } else if (Array.isArray(paramValue)) {
      const variable = createArrayVariable(paramName, paramValue, false, paramSource, { isParameter: true });
      childEnv.setParameterVariable(paramName, variable);
    } else if (typeof paramValue === 'object' && paramValue !== null) {
      const variable = createObjectVariable(paramName, paramValue, false, paramSource, { isParameter: true });
      childEnv.setParameterVariable(paramName, variable);
    } else {
      // For numbers, booleans, etc., convert to text
      const variable = createSimpleTextVariable(paramName, String(paramValue), paramSource, { isParameter: true });
      childEnv.setParameterVariable(paramName, variable);
    }
  }
  
  const definition = cmdVariable.value;
  
  // Handle template executables
  if (definition.type === 'template') {
    // Execute text template with bound parameters
    const text = await interpolate(definition.template, childEnv);
    return text;
  } else if (definition.type === 'command') {
    // Execute command template with bound parameters
    if (!definition.template) {
      throw new Error(`Command executable has no template`);
    }
    const command = await interpolate(definition.template, childEnv);
    return await childEnv.executeCommand(command);
  } else if (definition.type === 'code') {
    // Execute code template with bound parameters
    if (!definition.template) {
      throw new Error(`Code executable has no template`);
    }
    
    const code = await interpolate(definition.template, childEnv);
    
    // Debug logging
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Foreach code execution:', {
        code,
        language: definition.language,
        argMap
      });
    }
    
    // Pass argMap as parameters for bash/shell to convert to environment variables
    const codeResult = await childEnv.executeCode(code, definition.language, argMap);
    
    // If the result looks like JSON (from return statement), parse it
    if (typeof codeResult === 'string' && 
        (codeResult.startsWith('"') || codeResult.startsWith('{') || codeResult.startsWith('[') || 
         codeResult === 'null' || codeResult === 'true' || codeResult === 'false' ||
         /^-?\d+(\.\d+)?$/.test(codeResult))) {
      try {
        const parsed = JSON.parse(codeResult);
        // Return the parsed value directly for data context
        return parsed;
      } catch {
        // Not valid JSON, use as-is
        return codeResult;
      }
    }
    
    return codeResult;
  } else if (definition.type === 'commandRef') {
    // TODO: Handle command references - for now throw error
    throw new Error(`Command reference execution in foreach not yet implemented`);
  } else {
    throw new Error(`Unsupported executable type: ${definition.type}`);
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
  
  if (!isExecutableVariable(cmdVariable)) {
    throw new Error(`Variable '${command.identifier}' cannot be used with foreach. Expected an @exec command or @text template with parameters, but got type: ${cmdVariable.type}`);
  }
  
  // 2. Validate array count matches parameter count
  const definition = cmdVariable.value;
  const paramCount = definition.paramNames?.length || 0;
  if (arrays.length !== paramCount) {
    const paramType = definition.sourceDirective === 'text' ? 'Text template' : 'Command';
    throw new Error(`${paramType} '${command.identifier}' expects ${paramCount} parameter${paramCount !== 1 ? 's' : ''}, but foreach is passing ${arrays.length} array${arrays.length !== 1 ? 's' : ''}`);
  }
  
  // Note: We don't evaluate the arrays here as they might contain variables
  // that aren't defined yet. Full validation happens during lazy evaluation.
}

/**
 * Evaluates a ForeachSectionExpression - iterating over arrays with section extraction
 * Usage: foreach [@array.field # section] as [[template]]
 */
export async function evaluateForeachSection(
  foreachExpr: any,
  env: Environment
): Promise<any[]> {
  const { arrayVariable, pathField, path, section, template } = foreachExpr.value || foreachExpr;
  
  // Handle the new flexible path expressions
  // If arrayVariable is not set, we need to find it in the path
  let actualArrayVariable = arrayVariable;
  let actualPathField = pathField;
  
  if (!actualArrayVariable && path) {
    // Look for a variable reference in the path
    for (const part of path) {
      if (part.type === 'VariableReference' && part.fields && part.fields.length > 0) {
        actualArrayVariable = part.identifier;
        actualPathField = part.fields[0].value || part.fields[0].field;
        break;
      }
    }
  }
  
  if (!actualArrayVariable) {
    throw new Error('Cannot determine array variable from foreach section expression');
  }
  
  // 1. Resolve the source array variable
  const arrayVar = env.getVariable(actualArrayVariable);
  if (!arrayVar) {
    throw new Error(`Array variable not found: ${actualArrayVariable}`);
  }
  
  // 2. Evaluate the array to get items
  const arrayValue = await evaluateDataValue(arrayVar.value, env);
  if (!Array.isArray(arrayValue)) {
    throw new Error(`Variable '${actualArrayVariable}' must be an array for foreach section extraction, got ${typeof arrayValue}`);
  }
  
  if (arrayValue.length === 0) {
    return []; // Return empty array for empty input
  }
  
  // 3. Process each item in the array
  const results: any[] = [];
  for (let i = 0; i < arrayValue.length; i++) {
    const item = arrayValue[i];
    
    try {
      // 4. Create child environment with item bound to array variable name
      const childEnv = env.createChild();
      childEnv.setParameterVariable(actualArrayVariable, {
        type: 'data',
        name: actualArrayVariable,
        value: item,
        definedAt: null,
        isFullyEvaluated: true
      });
      
      // 5. Get the path value
      let pathValue: string;
      
      if (path) {
        // For flexible path expressions, evaluate the entire path
        pathValue = await interpolate(path, childEnv);
      } else if (actualPathField) {
        // For simple case, get path from item field
        if (!item || typeof item !== 'object') {
          throw new Error(`Array item ${i + 1} must be an object with '${actualPathField}' field, got ${typeof item}`);
        }
        
        pathValue = item[actualPathField];
        if (typeof pathValue !== 'string') {
          throw new Error(`Path field '${actualPathField}' in array item ${i + 1} must be a string, got ${typeof pathValue}`);
        }
      } else {
        throw new Error('No path specified for foreach section extraction');
      }
      
      // 6. Resolve section name (can be literal or variable)
      let sectionName: string;
      
      // Handle section as an array of nodes
      const sectionNodes = Array.isArray(section) ? section : [section];
      
      if (sectionNodes.length === 1 && sectionNodes[0].type === 'Text') {
        sectionName = sectionNodes[0].content;
      } else if (sectionNodes.length === 1 && sectionNodes[0].type === 'VariableReference') {
        // Evaluate section variable in child environment (with current item bound)
        const sectionValue = await interpolate(sectionNodes, childEnv);
        if (typeof sectionValue !== 'string') {
          throw new Error(`Section variable must resolve to a string, got ${typeof sectionValue}`);
        }
        sectionName = sectionValue;
      } else if (sectionNodes.length > 0) {
        // Multiple nodes - interpolate them all
        const sectionValue = await interpolate(sectionNodes, childEnv);
        if (typeof sectionValue !== 'string') {
          throw new Error(`Section must resolve to a string, got ${typeof sectionValue}`);
        }
        sectionName = sectionValue;
      } else {
        throw new Error('Section name is required for foreach section extraction');
      }
      
      // 7. Read file and extract section from file
      // Resolve the path relative to the current file
      const resolvedPath = await env.resolvePath(pathValue);
      const fileContent = await env.readFile(resolvedPath);
      
      // Extract the section using llmxml
      const { llmxmlInstance } = await import('../utils/llmxml-instance');
      let sectionContent: string;
      try {
        // getSection expects just the title without the # prefix
        const titleWithoutHash = sectionName.replace(/^#+\s*/, '');
        sectionContent = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
          includeNested: true
        });
        // Trim trailing whitespace
        sectionContent = sectionContent.trimEnd();
      } catch (error) {
        // Fallback to basic extraction if llmxml fails
        sectionContent = extractSectionBasic(fileContent, sectionName);
      }
      
      // 8. Apply template with current item context
      const templateResult = await interpolate(template.values.content, childEnv);
      
      // 9. Replace the first line (header) of section content with template result
      // This mimics the behavior of the 'as' clause in @add directive
      const lines = sectionContent.split('\n');
      if (lines.length > 0 && lines[0].match(/^#+\s/)) {
        // Replace the header line with the template result
        lines[0] = templateResult;
        const result = lines.join('\n');
        results.push(result);
      } else {
        // If no header found, prepend the template result
        const result = templateResult + '\n' + sectionContent;
        results.push(result);
      }
      
    } catch (error) {
      // Include iteration context in error message
      const itemInfo = typeof item === 'object' && item !== null 
        ? Object.keys(item).slice(0, 3).map(k => `${k}: ${JSON.stringify(item[k])}`).join(', ')
        : String(item);
      
      throw new Error(
        `Error in foreach section iteration ${i + 1} (${itemInfo}): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  return results;
}

/**
 * Extract a section from markdown content.
 * Basic fallback implementation when llmxml fails.
 */
function extractSectionBasic(content: string, sectionName: string): string {
  const lines = content.split('\n');
  const sectionRegex = new RegExp(`^#+\\s+${sectionName}\\s*$`, 'i');
  
  let inSection = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];
  
  for (const line of lines) {
    // Check if this line starts our section
    if (!inSection && sectionRegex.test(line)) {
      inSection = true;
      sectionLevel = line.match(/^#+/)?.[0].length || 0;
      continue; // Skip the header itself
    }
    
    // If we're in the section
    if (inSection) {
      // Check if we've hit another header at the same or higher level
      const headerMatch = line.match(/^(#+)\s+/);
      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        // We've left the section
        break;
      }
      
      sectionLines.push(line);
    }
  }
  
  return sectionLines.join('\n').trim();
}