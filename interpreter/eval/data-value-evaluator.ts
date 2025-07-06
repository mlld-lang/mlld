import type { Environment } from '../env/Environment';
import type { 
  DataValue,
  DataObjectValue as DataObject,
  DataArrayValue as DataArray
} from '@core/types/var';
import { 
  isDirectiveValue,
  isVariableReferenceValue,
  isTemplateValue,
  isPrimitiveValue
} from '@core/types/var';
import { createObjectVariable, createArrayVariable } from '@core/types/variable';
import { EvaluationStateManager } from './data-values/EvaluationStateManager';
import { PrimitiveEvaluator } from './data-values/PrimitiveEvaluator';
import { CollectionEvaluator } from './data-values/CollectionEvaluator';
import { VariableReferenceEvaluator } from './data-values/VariableReferenceEvaluator';

// Type guards for foreach expressions
function isForeachCommandExpression(value: any): boolean {
  return typeof value === 'object' && value !== null && value.type === 'foreach';
}

function isForeachSectionExpression(value: any): boolean {
  return typeof value === 'object' && value !== null && value.type === 'foreachSection';
}
import { 
  isExecutable,
  isArray,
  isObject,
  isTextLike,
  isPath,
  isImported,
  Variable
} from '@core/types/variable';
import { evaluate, interpolate, resolveVariableValue } from '../core/interpreter';
import { accessField } from '../utils/field-access';
import { 
  cartesianProduct, 
  validateArrayInputs, 
  isWithinPerformanceLimit 
} from '../utils/cartesian-product';
import { logger } from '@core/utils/logger';

/**
 * State manager for evaluation caching
 */
const stateManager = new EvaluationStateManager();

/**
 * Primitive evaluator for simple values and directives
 */
const primitiveEvaluator = new PrimitiveEvaluator(stateManager);

/**
 * Collection evaluator for objects and arrays
 */
const collectionEvaluator = new CollectionEvaluator(evaluateDataValue);

/**
 * Variable reference evaluator for variable resolution and field access
 */
const variableReferenceEvaluator = new VariableReferenceEvaluator(evaluateDataValue);

/**
 * Evaluates a DataValue, recursively evaluating any embedded directives,
 * variable references, or templates.
 */
export async function evaluateDataValue(
  value: DataValue,
  env: Environment
): Promise<any> {
  // Check if primitive evaluator can handle this value
  if (primitiveEvaluator.canHandle(value)) {
    return await primitiveEvaluator.evaluate(value, env);
  }
  
  // Check if collection evaluator can handle this value
  if (collectionEvaluator.canHandle(value)) {
    return await collectionEvaluator.evaluate(value, env);
  }
  
  // Check if variable reference evaluator can handle this value
  if (variableReferenceEvaluator.canHandle(value)) {
    return await variableReferenceEvaluator.evaluate(value, env);
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
  
  // Handle direct foreach structure from grammar 
  if (value && typeof value === 'object' && value.type === 'foreach-command') {
    return await evaluateForeachCommand(value, env);
  }
  
  // Fallback - return the value as-is
  logger.warn('Unexpected value type in evaluateDataValue:', { value });
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
    const cached = stateManager.getCachedResult(value);
    return cached?.hit === true;
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
  const { execInvocation } = foreachExpr.value || foreachExpr;
  
  // Extract command name and arguments from execInvocation
  let commandName: string;
  let commandArgs: any[] = [];
  
  if (execInvocation.type === 'ExecInvocation') {
    // Handle @func(args) exec invocation
    commandName = execInvocation.commandRef.name;
    commandArgs = execInvocation.commandRef.args || [];
  } else if (execInvocation.identifier) {
    // Handle @var variable reference (legacy support)
    commandName = execInvocation.identifier;
  } else {
    throw new Error('Invalid foreach command structure');
  }
  
  // 1. Resolve the command variable
  const cmdVariable = env.getVariable(commandName);
  if (!cmdVariable) {
    throw new Error(`Command not found: ${commandName}`);
  }
  
  if (!isExecutable(cmdVariable)) {
    throw new Error(`Variable '${commandName}' cannot be used with foreach. Expected an @exec command or @text template with parameters, but got type: ${cmdVariable.type}`);
  }
  
  // 2. Evaluate all array arguments from the exec invocation
  const evaluatedArrays: any[][] = [];
  for (let i = 0; i < commandArgs.length; i++) {
    const arrayVar = commandArgs[i];
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
    throw new Error(`${paramType} '${commandName}' expects ${paramCount} parameter${paramCount !== 1 ? 's' : ''}, but foreach is passing ${evaluatedArrays.length} array${evaluatedArrays.length !== 1 ? 's' : ''}`);
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
      logger.debug('Foreach code execution:', {
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
  
  if (!isExecutable(cmdVariable)) {
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
      const itemVar = Array.isArray(item) ?
        createArrayVariable(actualArrayVariable, item, {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        }, {
          isParameter: true,
          isFullyEvaluated: true
        }) :
        createObjectVariable(actualArrayVariable, item, {
          directive: 'var',
          syntax: 'object',
          hasInterpolation: false,
          isMultiLine: false
        }, {
          isParameter: true,
          isFullyEvaluated: true
        });
      childEnv.setParameterVariable(actualArrayVariable, itemVar);
      
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