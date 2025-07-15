/**
 * Enhanced variable resolution that preserves Variable wrappers when possible
 * Part of Phase 3: Making Variables flow through the system
 */

import type { Variable, VariableValue } from '@core/types/variable/VariableTypes';
import type { Environment } from '@interpreter/env/Environment';
import { 
  isTextLike,
  isStructured,
  isPath,
  isPipelineInput,
  isExecutableVariable,
  isImported,
  isComputed,
  isPrimitive,
  isObject,
  isArray
} from '@core/types/variable';
import { evaluateDataValue } from '@interpreter/eval/data-values';

/**
 * Resolution context to determine when to extract values
 */
export enum ResolutionContext {
  // Contexts where we should preserve Variables
  VariableAssignment = 'variable-assignment',
  ArrayElement = 'array-element',
  ObjectProperty = 'object-property',
  FunctionArgument = 'function-argument',
  PipelineStage = 'pipeline-stage',
  
  // Contexts where we must extract values
  StringInterpolation = 'string-interpolation',
  CommandExecution = 'command-execution',
  FileOutput = 'file-output',
  Conditional = 'conditional',
  Display = 'display'
}

/**
 * Determines if we should preserve the Variable wrapper in this context
 */
export function shouldPreserveVariable(context: ResolutionContext): boolean {
  switch (context) {
    case ResolutionContext.VariableAssignment:
    case ResolutionContext.ArrayElement:
    case ResolutionContext.ObjectProperty:
    case ResolutionContext.FunctionArgument:
    case ResolutionContext.PipelineStage:
      return true;
    
    case ResolutionContext.StringInterpolation:
    case ResolutionContext.CommandExecution:
    case ResolutionContext.FileOutput:
    case ResolutionContext.Conditional:
    case ResolutionContext.Display:
      return false;
      
    default:
      // Default to extraction for safety
      return false;
  }
}

/**
 * Enhanced variable resolution that preserves Variables when appropriate
 * 
 * @param variable - The Variable to resolve
 * @param env - The environment for evaluation
 * @param context - The context determining if we should preserve the Variable
 * @returns Either the Variable itself or its extracted value
 */
export async function resolveVariable(
  variable: Variable, 
  env: Environment,
  context: ResolutionContext = ResolutionContext.Display
): Promise<Variable | VariableValue> {
  
  // If context allows preservation, return the Variable itself for most types
  if (shouldPreserveVariable(context)) {
    // Special handling for complex/lazy evaluated variables
    if (isStructured(variable)) {
      const complexFlag = (variable as any).isComplex;
      if (complexFlag) {
        // Complex data needs evaluation but we can wrap result in a new Variable
        const evaluatedValue = await evaluateDataValue(variable.value, env);
        
        // Create a new Variable with the evaluated value
        return {
          ...variable,
          value: evaluatedValue,
          metadata: {
            ...variable.metadata,
            wasEvaluated: true,
            evaluatedAt: Date.now()
          }
        } as Variable;
      }
    }
    
    // For executable variables in non-execution contexts, preserve them
    if (isExecutableVariable(variable)) {
      return variable;
    }
    
    // Most variables can be returned as-is
    return variable;
  }
  
  // Context requires extraction - use original logic
  return resolveVariableValueLegacy(variable, env);
}

/**
 * Legacy resolution that always extracts values
 * This is the original resolveVariableValue logic
 */
export async function resolveVariableValueLegacy(
  variable: Variable, 
  env: Environment
): Promise<VariableValue> {
  
  // Type-specific resolution using type guards
  if (isPrimitive(variable)) {
    return variable.value;
  } else if (isTextLike(variable)) {
    return variable.value;
  } else if (isStructured(variable)) {
    const complexFlag = (variable as any).isComplex;
    
    if (complexFlag) {
      const evaluatedValue = await evaluateDataValue(variable.value, env);
      return evaluatedValue;
    }
    
    return variable.value;
  } else if (isPath(variable)) {
    return variable.value.resolvedPath;
  } else if (isPipelineInput(variable)) {
    return variable.value.text;
  } else if (isExecutableVariable(variable)) {
    // Auto-execute executables when interpolated
    const { evaluateExecInvocation } = await import('../eval/exec-invocation');
    const invocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: variable.name,
        args: []
      }
    };
    const result = await evaluateExecInvocation(invocation as any, env);
    return result.value;
  } else if (isImported(variable)) {
    return variable.value;
  } else if (isComputed(variable)) {
    return variable.value;
  }
  
  // Fallback
  return variable.value;
}

/**
 * Helper to check if a value is a Variable
 */
export function isVariable(value: unknown): value is Variable {
  return value !== null && 
         typeof value === 'object' && 
         'type' in value && 
         'name' in value && 
         'value' in value &&
         'source' in value;
}

/**
 * Extract value from Variable or return value as-is
 */
export async function extractValue(
  value: Variable | VariableValue,
  env: Environment
): Promise<VariableValue> {
  if (isVariable(value)) {
    return resolveVariableValueLegacy(value, env);
  }
  return value;
}