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
import { asData, asText, isStructuredValue } from './structured-value';
// Import removed to avoid circular dependency - will use dynamic import if needed

/**
 * Resolution context to determine when to extract values
 * 
 * WHY: Different usage contexts have different requirements for Variables.
 * Some contexts need the Variable wrapper for type introspection or metadata,
 * while others need raw values for processing or display.
 */
export enum ResolutionContext {
  // Contexts where we should preserve Variables
  VariableAssignment = 'variable-assignment',    // WHY: Target variable needs full type info
  VariableCopy = 'variable-copy',                // WHY: Copying requires preserving metadata
  ArrayElement = 'array-element',                // WHY: Arrays can store Variables with types
  ObjectProperty = 'object-property',            // WHY: Objects can store Variables with types
  FunctionArgument = 'function-argument',        // WHY: Shadow envs need type introspection (mlld.isVariable)
  DataStructure = 'data-structure',              // WHY: Data structures preserve Variable types
  FieldAccess = 'field-access',                  // WHY: TODO - Why preserve for field access?
  ImportResult = 'import-result',                // WHY: Imports preserve module Variable types
  
  // Contexts where we must extract values
  StringInterpolation = 'string-interpolation',  // WHY: Templates need raw strings to concat
  CommandExecution = 'command-execution',        // WHY: Shell commands need raw strings
  FileOutput = 'file-output',                    // WHY: Files contain raw content, not Variables
  Conditional = 'conditional',                   // WHY: Conditions evaluate raw truthy/falsy values
  Display = 'display',                           // WHY: Users see final content, not wrappers
  PipelineInput = 'pipeline-input',              // WHY: Pipelines transform raw data, not types
  Truthiness = 'truthiness',                     // WHY: Truthy checks need raw values
  Equality = 'equality'                          // WHY: Comparison needs raw values
}

/**
 * Determines if we should preserve the Variable wrapper in this context
 * 
 * WHY: Preserving Variables maintains type information and metadata that would
 * be lost if we extracted the raw value. This enables type introspection,
 * special behaviors (custom toString), and proper handling of complex types.
 * 
 * @param context - The context in which the Variable is being used
 * @returns true if Variable wrapper should be preserved, false if value should be extracted
 */
export function shouldPreserveVariable(context: ResolutionContext): boolean {
  switch (context) {
    // Preserve Variable wrapper contexts
    case ResolutionContext.VariableAssignment:
    case ResolutionContext.VariableCopy:
    case ResolutionContext.ArrayElement:
    case ResolutionContext.ObjectProperty:
    case ResolutionContext.FunctionArgument:
    case ResolutionContext.DataStructure:
    case ResolutionContext.FieldAccess:
    case ResolutionContext.ImportResult:
      return true;
    
    // Extract raw value contexts
    case ResolutionContext.StringInterpolation:
    case ResolutionContext.CommandExecution:
    case ResolutionContext.FileOutput:
    case ResolutionContext.Conditional:
    case ResolutionContext.Display:
    case ResolutionContext.PipelineInput:
    case ResolutionContext.Truthiness:
    case ResolutionContext.Equality:
      return false;
      
    default:
      // Default to extraction for safety
      return false;
  }
}

/**
 * Enhanced variable resolution that preserves Variables when appropriate
 * 
 * WHY: This function is the central decision point for Variable handling. It determines
 * whether to preserve the Variable wrapper (maintaining type info and metadata) or
 * extract the raw value based on usage context.
 * 
 * GOTCHA: PipelineInput Variables always return their .value property even in
 * PipelineInput context because they're wrapper objects, not the actual input.
 * 
 * CONTEXT: Called throughout the interpreter when Variables need resolution.
 * The context parameter is critical for correct behavior.
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
  
  /**
   * Special case: PipelineInput handling
   * WHY: PipelineInput is a wrapper Variable containing the actual pipeline data.
   * We return .value (the wrapped object) not the Variable itself because pipelines
   * work with raw data transformations, not mlld Variable types.
   */
  if (isPipelineInput(variable) && context === ResolutionContext.PipelineInput) {
    return variable.value; // Return the PipelineInput object, not the Variable wrapper
  }
  
  // If context allows preservation, return the Variable itself for most types
  if (shouldPreserveVariable(context)) {
    /**
     * Complex/lazy variable handling
     * WHY: Complex variables contain unevaluated mlld directives (like run commands).
     * We evaluate them on access but create a new Variable with the result to
     * preserve type information and track that evaluation occurred.
     * GOTCHA: The wasEvaluated metadata prevents re-evaluation of the same content.
     * TODO: Why create new Variable instead of caching in the original?
     */
    if (isStructured(variable)) {
      const complexFlag = (variable as any).isComplex;
      if (complexFlag) {
        // Complex data needs evaluation but we can wrap result in a new Variable
        // Dynamic import to avoid circular dependency
        const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
        const evaluatedValue = await evaluateDataValue(variable.value, env);
        
        const evaluatedAt = Date.now();
        // Create a new Variable with the evaluated value
        return {
          ...variable,
          value: evaluatedValue,
          metadata: {
            ...variable.metadata,
            wasEvaluated: true,
            evaluatedAt
          },
          internal: {
            ...(variable.internal ?? {}),
            wasEvaluated: true,
            evaluatedAt
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
  
  // Context requires extraction
  const extracted = await extractVariableValue(variable, env);
  if (!isStructuredValue(extracted)) {
    return extracted;
  }
  if (context === ResolutionContext.Equality) {
    return asData(extracted);
  }
  if (context === ResolutionContext.CommandExecution) {
    return asText(extracted);
  }
  return extracted;
}

/**
 * Extract raw value from a Variable
 * Always returns the underlying JavaScript value
 * 
 * WHY: Some contexts need raw values, not Variable wrappers. This function
 * handles all Variable types and ensures proper evaluation of complex/lazy
 * variables and auto-execution of executables.
 * 
 * GOTCHA: ExecutableVariables auto-execute when extracted (e.g., in pipelines
 * where @func means "execute with piped input").
 * 
 * @param variable - The Variable to extract value from
 * @param env - The environment for evaluation
 * @returns The raw JavaScript value
 */
export async function extractVariableValue(
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
      // Dynamic import to avoid circular dependency
      const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
      const evaluatedValue = await evaluateDataValue(variable.value, env);
      return evaluatedValue;
    }
    
    // Check if this is an array with custom behaviors (LoadContentResultArray, RenamedContentArray)
    // WHY: Special array types have behaviors (toString, content getter) that must be preserved
    //      during value extraction to maintain proper output formatting
    const arrayType =
      (variable.internal as Record<string, unknown> | undefined)?.arrayType ??
      variable.metadata?.arrayType;
    if (
      variable.type === 'array' &&
      arrayType &&
      (arrayType === 'renamed-content' || arrayType === 'load-content-result')
    ) {
      // Use the variable-migration extractVariableValue to preserve behaviors
      const { extractVariableValue: extractWithBehaviors } = await import('./variable-migration');
      return extractWithBehaviors(variable);
    }
    
    return variable.value;
  } else if (isPath(variable)) {
    return variable.value.resolvedPath;
  } else if (isPipelineInput(variable)) {
    // For pipeline inputs, return the whole PipelineInput object
    // so that pipeline functions can access .json, .csv, etc.
    return variable.value;
  } else if (isExecutableVariable(variable)) {
    /**
     * Auto-execute executables when extracting
     * WHY: In extraction contexts (like pipelines), @func without parentheses
     * means "execute with piped input". This enables the pattern:
     * "text" | @uppercase | @trim where executables act as transforms.
     */
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
 * Resolve a value that might be a Variable or raw value
 * Uses context to determine whether to preserve or extract
 * 
 * WHY: This is a convenience wrapper that handles both Variables and raw values,
 * making it easier to work with values that might or might not be wrapped.
 * 
 * CONTEXT: Used throughout the interpreter where values could be either
 * Variables (from variable references) or raw values (from literals).
 * 
 * @param value - Either a Variable or raw value
 * @param env - The environment for evaluation
 * @param context - The resolution context
 * @returns Either the Variable or extracted value based on context
 */
export async function resolveValue(
  value: Variable | VariableValue,
  env: Environment,
  context: ResolutionContext
): Promise<Variable | VariableValue> {
  if (isVariable(value)) {
    return resolveVariable(value, env, context);
  }
  return value;
}

// Remove legacy aliases - use extractVariableValue or resolveVariable with context
