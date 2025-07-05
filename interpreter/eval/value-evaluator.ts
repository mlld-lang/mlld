import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { DataValue } from '@core/types/var';
import { 
  isDirectiveValue, 
  isVariableReferenceValue, 
  isTemplateValue,
  isPrimitiveValue
} from '@core/types/var';
import { evaluate } from '../core/interpreter';

// Simple cache to prevent double evaluation of the same directive
const evaluationCache = new WeakMap<DirectiveNode, any>();

// Evaluation state tracking for debugging and error collection
interface EvaluationState {
  evaluated: boolean;
  result?: any;
  error?: Error;
}

const evaluationStateCache = new WeakMap<any, EvaluationState>();

/**
 * Unified data value evaluator that handles lazy evaluation of embedded directives,
 * variable references, templates, and other complex data structures.
 * 
 * This consolidates the logic from both lazy-eval.ts and data-value-evaluator.ts
 * into a single, consistent implementation.
 */
export async function evaluateDataValue(
  value: DataValue,
  env: Environment
): Promise<any> {
  // Handle primitive values - no evaluation needed
  if (isPrimitiveValue(value)) {
    return value;
  }
  
  // Debug logging
  if (process.env.DEBUG_LAZY_EVAL || process.env.MLLD_DEBUG === 'true') {
    console.log('evaluateDataValue called with:', JSON.stringify(value, null, 2).substring(0, 200));
  }
  
  // Handle Text nodes
  if (value && typeof value === 'object' && value.type === 'Text' && 'content' in value) {
    return value.content;
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
  
  // Handle embedded directives
  if (isDirectiveValue(value)) {
    // Check if we've already evaluated this directive
    const cached = evaluationStateCache.get(value);
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
      evaluationStateCache.set(value, state);
      
      return finalValue;
    } catch (error) {
      // Cache the error
      const state: EvaluationState = {
        evaluated: true,
        result: undefined,
        error: error instanceof Error ? error : new Error(String(error))
      };
      evaluationStateCache.set(value, state);
      throw error;
    }
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
  
  // Handle foreach expressions
  if (value && typeof value === 'object' && value.type === 'foreach') {
    if (process.env.MLLD_DEBUG === 'true') {
      console.log('Found foreach expression in value-evaluator:', JSON.stringify(value, null, 2));
    }
    const { evaluateForeachCommand } = await import('./foreach');
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
      
      // If pipeline result has a text property, extract it
      if (pipelineResult && typeof pipelineResult === 'object' && 'text' in pipelineResult) {
        return pipelineResult.text;
      } else {
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
        // Not JSON, return as string
        return result.value;
      }
    }
    
    return result.value;
  }
  
  // Handle runExec nodes (run @command() in object context)
  if (value && typeof value === 'object' && value.type === 'runExec' && 'invocation' in value) {
    const { evaluateExecInvocation } = await import('./exec-invocation');
    const result = await evaluateExecInvocation(value.invocation as any, env);
    return result.value;
  }
  
  // Handle path nodes (from [/path/to/file])
  if (value?.type === 'path') {
    // Resolve path segments and read file
    const { interpolate } = await import('../core/interpreter');
    const resolvedPath = await interpolate(value.segments || [], env);
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
    
    // Resolve the variable value
    const { resolveVariableValue } = await import('../core/interpreter');
    let result = await resolveVariableValue(baseVar, env);
    
    // Apply field access if present
    if (value.fields && value.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      // Apply each field access in sequence
      for (const field of value.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexVar = env.getVariable(field.value);
          if (!indexVar) {
            throw new Error(`Variable not found for index: ${field.value}`);
          }
          // Get the actual value to use as index
          let indexValue = indexVar.value;
          if (typeof indexValue === 'object' && indexValue !== null && 'value' in indexValue) {
            indexValue = indexValue.value;
          }
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          result = accessField(result, resolvedField);
        } else {
          result = accessField(result, field);
        }
      }
    }
    
    return result;
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
  
  // Handle template values - they're valid in lazy evaluation context
  if (isTemplateValue(value)) {
    // Templates in lazy evaluation are deferred execution contexts
    // Interpolate them now with full environment context
    const { interpolate } = await import('../core/interpreter');
    return await interpolate(value, env);
  }
  
  // Handle executable code objects (from imported executable variables)
  if (value && typeof value === 'object' && 
      (value.type === 'code' || value.type === 'command') && 
      ('template' in value || 'codeTemplate' in value || 'commandTemplate' in value)) {
    // This is an executable variable definition - return it as-is
    // It will be handled by the execution system when invoked
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
  console.warn('Unhandled data value type in lazy evaluation:', value);
  return value;
}

/**
 * Check if a data value contains any unevaluated directives
 */
export function hasUnevaluatedDirectives(value: DataValue): boolean {
  if (isPrimitiveValue(value)) {
    return false;
  }
  
  if (value?.type === 'Directive') {
    return true;
  }
  
  // Check for foreach expressions
  if (value && typeof value === 'object' && value.type === 'foreach') {
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

/**
 * Check if a data value is fully evaluated (no pending directives)
 */
export function isFullyEvaluated(value: DataValue): boolean {
  return !hasUnevaluatedDirectives(value);
}

/**
 * Collect evaluation errors from cached evaluation states
 */
export function collectEvaluationErrors(
  value: DataValue,
  errors: Error[] = []
): Error[] {
  if (isPrimitiveValue(value)) {
    return errors;
  }
  
  // Check for cached errors
  const cached = evaluationStateCache.get(value);
  if (cached?.error) {
    errors.push(cached.error);
  }
  
  // Recursively check arrays and objects
  if (Array.isArray(value)) {
    value.forEach(item => collectEvaluationErrors(item, errors));
  } else if (value && typeof value === 'object') {
    if (value.type === 'array' && 'elements' in value) {
      value.elements.forEach(item => collectEvaluationErrors(item, errors));
    } else if (value.type === 'object' && 'properties' in value) {
      Object.values(value.properties).forEach(item => collectEvaluationErrors(item, errors));
    } else if (!value.type) {
      // Plain object
      Object.values(value).forEach(item => collectEvaluationErrors(item, errors));
    }
  }
  
  return errors;
}