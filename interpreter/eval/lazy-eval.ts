import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { DataValue } from '@core/types/var';
import { isDirectiveValue, isVariableReferenceValue, isTemplateValue } from '@core/types/var';
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
  
  // Debug logging
  if (process.env.DEBUG_LAZY_EVAL) {
    console.log('evaluateDataValue called with:', JSON.stringify(value, null, 2).substring(0, 200));
  }
  
  // Handle wrapped string values FIRST (with content array and wrapperType)
  // This needs to be before other object checks because these objects don't have a type field
  if (value && typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
    // This is a wrapped string (quotes, backticks, or brackets)
    if (process.env.DEBUG_LAZY_EVAL) {
      console.log('Found wrapped string:', { wrapperType: value.wrapperType, contentLength: value.content.length });
    }
    const { interpolate } = await import('../core/interpreter');
    return await interpolate(value.content, env);
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
    const command = value.command || '';
    const result = await env.executeCommand(command);
    return result;
  }
  
  // Handle path nodes (from [/path/to/file])
  if (value?.type === 'path') {
    // Resolve path segments and read file
    const { interpolate } = await import('../core/interpreter');
    const resolvedPath = await interpolate(value.segments || [], env);
    console.log('DEBUG: About to read file:', resolvedPath);
    console.log('DEBUG: Path node:', JSON.stringify(value, null, 2));
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
    
    // Resolve the variable value
    const { resolveVariableValue } = await import('../core/interpreter');
    let result = await resolveVariableValue(baseVar, env);
    
    // Apply field access if present
    if (value.fields && value.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      // Apply each field access in sequence
      for (const field of value.fields) {
        result = accessField(result, field);
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
    // Import the evaluator from data-value-evaluator
    const { evaluateDataValue: evaluateFull } = await import('./data-value-evaluator');
    return await evaluateFull(value, env);
  }
  
  // Handle foreach section expressions
  if (value && typeof value === 'object' && value.type === 'foreach-section') {
    // Import the evaluator from data-value-evaluator
    const { evaluateForeachSection } = await import('./data-value-evaluator');
    return await evaluateForeachSection(value, env);
  }
  
  // Handle ExecInvocation nodes
  if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
    // Import the evaluator from exec-invocation
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(value as any, env);
    return result.value;
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
  
  // Check for foreach expressions (both command and section)
  if (value && typeof value === 'object' && (value.type === 'foreach-command' || value.type === 'foreach-section')) {
    return true;
  }
  
  // Check for ExecInvocation nodes
  if (value && typeof value === 'object' && value.type === 'ExecInvocation') {
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