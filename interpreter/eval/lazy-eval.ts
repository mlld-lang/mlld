import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { DataValue } from '@core/types/var';
import { isDirectiveValue, isVariableReferenceValue, isTemplateValue } from '@core/types/var';
import { evaluate } from '../core/interpreter';
import { logger } from '@core/utils/logger';

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
  
  // Debug logging
  if (process.env.DEBUG_LAZY_EVAL) {
    logger.debug('evaluateDataValue called with:', { value: JSON.stringify(value, null, 2).substring(0, 200) });
  }
  
  // Handle wrapped string values FIRST (with content array and wrapperType)
  // This needs to be before other object checks because these objects don't have a type field
  if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
    // This is a wrapped string (quotes, backticks, or brackets)
    const { interpolate } = await import('../core/interpreter');
    return await interpolate(value.content, env);
  }
  
  // Handle command objects (from run directives in objects)
  if (value && typeof value === 'object' && value.type === 'command' && 'command' in value) {
    // Execute the command
    // command might be a string or an array of text nodes
    let commandStr: string;
    if (typeof value.command === 'string') {
      commandStr = value.command;
    } else if (Array.isArray(value.command)) {
      // Interpolate the command array
      const { interpolate } = await import('../core/interpreter');
      commandStr = await interpolate(value.command, env);
    } else {
      throw new Error('Invalid command format in lazy evaluation');
    }
    const result = await env.executeCommand(commandStr);
    return result;
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
  
  // Handle command nodes (from run {command})
  if (value?.type === 'command') {
    // Execute the command directly
    let commandStr: string;
    if (typeof value.command === 'string') {
      commandStr = value.command || '';
    } else if (Array.isArray(value.command)) {
      // Interpolate the command array
      const { interpolate } = await import('../core/interpreter');
      commandStr = await interpolate(value.command, env) || '';
    } else {
      commandStr = '';
    }
    const result = await env.executeCommand(commandStr);
    return result;
  }
  
  // Handle path nodes (from [/path/to/file])
  if (value?.type === 'path') {
    // Resolve path segments and read file
    const { interpolate } = await import('../core/interpreter');
    const resolvedPath = await interpolate(value.segments || [], env);
    logger.debug('About to read file', {
      resolvedPath,
      pathNode: value
    });
    // Read the file content
    const content = await env.fileSystem.readFile(resolvedPath);
    return content;
  }
  
  // Handle variable references (e.g., @user.name)
  if (value?.type === 'VariableReference') {
    // Get the base variable
    const baseVar = env.getVariable(value.identifier);
    if (!baseVar) {
      throw new Error(`Variable not found: ${value.identifier}`);
    }
    
    // Import type guard to check if it's an executable
    const { isExecutableVariable } = await import('@core/types/variable');
    
    // If it's an executable reference without invocation, return the variable itself
    // This allows storing executable references in objects
    if (isExecutableVariable(baseVar) && (!value.fields || value.fields.length === 0)) {
      return baseVar;
    }
    
    // Resolve the variable value with appropriate context
    const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
    let result = await resolveVariable(baseVar, env, ResolutionContext.DataStructure);
    
    // Apply field access if present
    if (value.fields && value.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      // Apply each field access in sequence
      for (const field of value.fields) {
        const fieldResult = accessField(result, field, { preserveContext: true });
        result = (fieldResult as any).value;
      }
    }
    
    return result;
  }
  
  // Handle Text nodes (from quoted strings)
  if (value?.type === 'Text') {
    return value.content;
  }
  
  
  // Handle other content arrays (like template content)
  if (value?.content && Array.isArray(value.content)) {
    // This might be a template with Text nodes
    const { interpolate } = await import('../core/interpreter');
    return await interpolate(value.content, env);
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
  
  // Handle foreach command expressions
  if (value && typeof value === 'object' && value.type === 'foreach-command') {
    const { evaluateForeachCommand } = await import('./foreach');
    return await evaluateForeachCommand(value, env);
  }
  
  // Handle foreach section expressions
  if (value && typeof value === 'object' && value.type === 'foreach-section') {
    const { evaluateForeachSection } = await import('./foreach');
    return await evaluateForeachSection(value, env);
  }
  
  // Handle ExecInvocation nodes
  if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
    // Import the evaluator from exec-invocation
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(value as any, env);
    return result.value;
  }
  
  // Handle runExec nodes (run @command() in object context)
  if (value && typeof value === 'object' && value.type === 'runExec' && 'invocation' in value) {
    // Import the evaluator from exec-invocation
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(value.invocation as any, env);
    return result.value;
  }
  
  // Handle executable code objects (from imported executable variables)
  if (value && typeof value === 'object' && 
      (value.type === 'code' || value.type === 'command') && 
      ('template' in value || 'codeTemplate' in value || 'commandTemplate' in value)) {
    // This is an executable variable definition - return it as-is
    // It will be handled by the execution system when invoked
    // Note: Some have paramNames, others don't - both are valid executable structures
    return value;
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    const evaluatedArray = [];
    for (const item of value) {
      evaluatedArray.push(await evaluateDataValue(item, env));
    }
    return evaluatedArray;
  }
  
  // Handle DataArray type (both 'elements' and 'items' properties)
  if (value?.type === 'array' && ('elements' in value || 'items' in value)) {
    const evaluatedArray = [];
    const items = value.elements || value.items || [];
    for (const element of items) {
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
      // Skip internal properties that shouldn't be in the result
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      evaluatedObject[key] = await evaluateDataValue(propValue, env);
    }
    return evaluatedObject;
  }
  
  // If we get here, it's an unhandled type
  logger.warn('Unhandled data value type in lazy evaluation:', { value });
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
  
  // Check for foreach expressions (both command and section)
  if (value && typeof value === 'object' && (value.type === 'foreach-command' || value.type === 'foreach-section')) {
    return true;
  }
  
  // Check for ExecInvocation nodes
  if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
    return true;
  }
  
  // Check for command objects (from run directives)
  if (value && typeof value === 'object' && value.type === 'command' && 'command' in value) {
    return true;
  }
  
  // Check for wrapped strings (quotes, backticks, brackets)
  if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
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