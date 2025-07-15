/**
 * Enhanced interpreter functions that preserve Variables
 * Part of Phase 3: Making Variables flow through the system
 */

import type { Variable, VariableValue } from '@core/types/variable/VariableTypes';
import type { Environment } from '@interpreter/env/Environment';
import { 
  ResolutionContext, 
  resolveVariable as resolveVariableEnhanced,
  extractValue,
  isVariable
} from '@interpreter/utils/variable-resolution';
import { logger } from '@core/utils/logger';

/**
 * Enhanced version of resolveVariableValue that can preserve Variables
 * based on an optional context parameter
 * 
 * @param variable - The Variable to resolve
 * @param env - The environment
 * @param context - Optional context to determine if we should preserve the Variable
 * @returns Either the Variable itself or its extracted value
 */
export async function resolveVariableValue(
  variable: Variable,
  env: Environment,
  context?: ResolutionContext
): Promise<Variable | VariableValue> {
  
  // If no context provided, default to Display (extraction)
  const resolutionContext = context || ResolutionContext.Display;
  
  // Use our enhanced resolution
  return resolveVariableEnhanced(variable, env, resolutionContext);
}

/**
 * Context-aware interpolation that preserves Variables when building
 * non-string results (arrays, objects) but extracts for final string output
 */
export async function interpolateWithContext(
  nodes: any[],
  env: Environment,
  context: ResolutionContext
): Promise<any> {
  // For non-string interpolation contexts, preserve Variables
  if (context !== ResolutionContext.StringInterpolation && 
      context !== ResolutionContext.Display &&
      context !== ResolutionContext.CommandExecution) {
    
    // This is likely building an array or object - preserve Variables
    const parts = [];
    
    for (const node of nodes) {
      if (!node) continue;
      
      if (node.type === 'VariableReference') {
        const variable = env.getVariable(node.identifier);
        if (!variable) {
          throw new Error(`Variable not found: ${node.identifier}`);
        }
        
        // Preserve the Variable in non-string contexts
        const resolved = await resolveVariableValue(variable, env, context);
        parts.push(resolved);
        
      } else if (node.type === 'Text') {
        parts.push(node.content || '');
        
      } else if (node.type === 'Newline') {
        parts.push('\n');
        
      } else {
        // For other node types, recursively process
        const { interpolate } = await import('./interpreter');
        const result = await interpolate([node], env);
        parts.push(result);
      }
    }
    
    // If single item, return it directly (might be a Variable)
    if (parts.length === 1) {
      return parts[0];
    }
    
    // For multiple items in non-string context, return array
    return parts;
  }
  
  // For string interpolation contexts, we need to extract values
  // Use the original interpolation logic
  const { interpolate } = await import('./interpreter');
  return interpolate(nodes, env);
}

/**
 * Helper to determine interpolation context from parent node type
 */
export function getInterpolationContext(parentNodeType?: string): ResolutionContext {
  switch (parentNodeType) {
    case 'array':
      return ResolutionContext.ArrayElement;
    case 'object':
      return ResolutionContext.ObjectProperty;
    case 'var':
      return ResolutionContext.VariableAssignment;
    case 'command':
      return ResolutionContext.CommandExecution;
    case 'template':
    case 'show':
      return ResolutionContext.StringInterpolation;
    default:
      return ResolutionContext.Display;
  }
}

/**
 * Enhanced variable reference resolution that preserves Variables
 * in appropriate contexts
 */
export async function resolveVariableReference(
  node: any,
  env: Environment,
  context?: ResolutionContext
): Promise<Variable | VariableValue> {
  const { identifier, fields } = node;
  
  // Look up the variable
  const variable = env.getVariable(identifier);
  if (!variable) {
    // Check for special @base
    if (identifier === 'base') {
      return env.getBasePath();
    }
    throw new Error(`Variable not found: ${identifier}`);
  }
  
  // If no field access, resolve based on context
  if (!fields || fields.length === 0) {
    return resolveVariableValue(variable, env, context);
  }
  
  // For field access, we need to extract the value first
  const baseValue = await extractValue(variable, env);
  
  // Then apply field access
  const { accessField } = await import('../utils/field-access');
  let result = baseValue;
  
  for (const field of fields) {
    if (field.type === 'variableIndex') {
      const indexVar = env.getVariable(field.value);
      if (!indexVar) {
        throw new Error(`Variable not found for index: ${field.value}`);
      }
      const indexValue = await extractValue(indexVar, env);
      result = await accessField(result, indexValue, env);
    } else {
      result = await accessField(result, field.value, env);
    }
  }
  
  return result;
}