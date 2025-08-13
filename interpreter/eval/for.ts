import type { ForDirective, ForExpression, Environment, ArrayVariable, Variable } from '@core/types';
import { evaluate, interpolate, type EvalResult } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { createArrayVariable, createObjectVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { VariableImporter } from './import/VariableImporter';
import { logger } from '@core/utils/logger';
import { DebugUtils } from '../env/DebugUtils';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';

// Helper to ensure a value is wrapped as a Variable
function ensureVariable(name: string, value: unknown): Variable {
  // If already a Variable, return as-is
  if (isVariable(value)) {
    return value;
  }
  
  // Special handling for LoadContentResult objects
  // These need to be preserved as objects with their special metadata
  if (isLoadContentResult(value) || isLoadContentResultArray(value)) {
    return createObjectVariable(
      name,
      value,
      false, // Not complex - it's already evaluated
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        isLoadContentResult: true,
        arrayType: isLoadContentResultArray(value) ? 'load-content-result' : undefined,
        source: 'for-loop'
      }
    );
  }
  
  // Otherwise, create a Variable from the value
  const importer = new VariableImporter();
  return importer.createVariableFromValue(name, value, 'for-loop');
}

export async function evaluateForDirective(
  directive: ForDirective,
  env: Environment
): Promise<EvalResult> {
  const varNode = directive.values.variable[0];
  const varName = varNode.identifier;
  
  // Debug support
  const debugEnabled = process.env.DEBUG_FOR === '1' || process.env.DEBUG_FOR === 'true' || process.env.MLLD_DEBUG === 'true';

  // Trace support
  env.pushDirective('/for', `@${varName} in ...`, directive.location);

  try {
    // Evaluate source collection
    // The source is an array containing the actual source node
    const sourceNode = Array.isArray(directive.values.source) 
      ? directive.values.source[0] 
      : directive.values.source;
    
    const sourceResult = await evaluate(sourceNode, env);
    const sourceValue = sourceResult.value;
    const iterable = toIterable(sourceValue);

    if (!iterable) {
      throw new MlldDirectiveError(
        'for',
        `Cannot iterate over ${typeof sourceValue}`,
        directive
      );
    }

    // Execute action for each item
    let i = 0;
    const iterableArray = Array.from(iterable);
    
    // Debug: Log collection info
    if (debugEnabled) {
      console.error('[DEBUG_FOR] For loop starting:', {
        directive: '/for',
        variable: varName,
        collectionType: Array.isArray(sourceValue) ? 'array' : typeof sourceValue,
        collectionSize: iterableArray.length,
        location: directive.location ? `${directive.location.start.line}:${directive.location.start.column}` : 'unknown'
      });
      
      // Show first few items for context
      if (iterableArray.length > 0) {
        const preview = iterableArray.slice(0, 3).map(([key, value]) => ({
          key,
          value: DebugUtils.truncateValue(value, typeof value, 30)
        }));
        console.error('[DEBUG_FOR] Collection preview:', { firstItems: preview });
      }
    }
    for (const [key, value] of iterableArray) {
      // Debug: Log iteration start
      if (debugEnabled) {
        console.error(`[DEBUG_FOR] For loop iteration ${i + 1}/${iterableArray.length}:`, {
          variable: varName,
          currentValue: DebugUtils.truncateValue(value, typeof value, 50),
          currentKey: key,
          hasKey: key !== null && typeof key === 'string'
        });
      }
      
      const childEnv = env.createChildEnvironment();
      // Preserve Variable wrappers when setting iteration variable
      const iterationVar = ensureVariable(varName, value);
      childEnv.setVariable(varName, iterationVar);

      // For objects, bind key with underscore pattern
      if (key !== null && typeof key === 'string') {
        const keyVar = ensureVariable(`${varName}_key`, key);
        childEnv.setVariable(`${varName}_key`, keyVar);
      }

      // Evaluate action in child environment
      // Handle action which might be an array of nodes (following /when pattern)
      const actionNodes = directive.values.action;
      let actionResult: any = { value: undefined, env: childEnv };
      
      // Debug: Log action evaluation
      if (debugEnabled && actionNodes.length > 0) {
        console.error('[DEBUG_FOR] Evaluating for loop action:', {
          actionType: actionNodes[0].type,
          actionCount: actionNodes.length
        });
      }
      
      for (const actionNode of actionNodes) {
        actionResult = await evaluate(actionNode, childEnv);
      }
      
      // Transfer output nodes from child to parent environment
      const childNodes = childEnv.getNodes();
      for (const node of childNodes) {
        env.addNode(node);
      }
      
      // Debug: Log iteration completion
      if (debugEnabled) {
        console.error(`[DEBUG_FOR] For loop iteration ${i + 1} completed:`, {
          outputNodes: childNodes.length,
          hasExecOutput: actionResult.value !== undefined && actionResult.value !== null
        });
      }
      
      // If the action was a bare exec invocation that produced output,
      // we need to add it as a text node (similar to how /run works)
      if (directive.values.action.length === 1 && 
          directive.values.action[0].type === 'ExecInvocation' &&
          actionResult.value !== undefined && actionResult.value !== null) {
        // Create nodes for the command output and interpolate safely
        const outputNodes = [{ 
          type: 'Text' as const, 
          content: String(actionResult.value),
          nodeId: `${directive.nodeId}-output-${i}`
        }];
        
        // Use interpolate with Template context for safe text handling
        const safeContent = await interpolate(outputNodes, childEnv, InterpolationContext.Template);
        
        const textNode = {
          type: 'Text' as const,
          nodeId: `${directive.nodeId}-exec-output-${i}`,
          content: safeContent + '\n', // Always add newline after each output
          location: directive.values.action[0].location
        };
        env.addNode(textNode);
      }
      i++;
    }
    
    // Debug: Log for loop completion
    if (debugEnabled) {
      console.error('[DEBUG_FOR] For loop completed:', {
        directive: '/for',
        variable: varName,
        totalIterations: i,
        expectedIterations: iterableArray.length
      });
    }
  } finally {
    env.popDirective();
  }
  
  // For directives don't produce a direct output value
  return { value: undefined, env };
}

export async function evaluateForExpression(
  expr: ForExpression,
  env: Environment
): Promise<ArrayVariable> {
  const varName = expr.variable.identifier;

  // Evaluate source collection
  const sourceResult = await evaluate(expr.source, env);
  const sourceValue = sourceResult.value;
  const iterable = toIterable(sourceValue);

  if (!iterable) {
    throw new MlldDirectiveError(
      'for',
      `Cannot iterate over ${typeof sourceValue}`,
      expr
    );
  }

  const results: unknown[] = [];
  const errors: Array<{ index: number; error: Error; value: unknown }> = [];

  // Collect results from each iteration
  for (const [key, value] of iterable) {
    const childEnv = env.createChildEnvironment();
    // Preserve Variable wrappers when setting iteration variable
    const iterationVar = ensureVariable(varName, value);
    childEnv.setVariable(varName, iterationVar);

    // For objects, bind key with underscore pattern
    if (key !== null && typeof key === 'string') {
      const keyVar = ensureVariable(`${varName}_key`, key);
      childEnv.setVariable(`${varName}_key`, keyVar);
    }

    try {
      // Expression is an array of nodes, evaluate them
      let exprResult: unknown = null;
      if (Array.isArray(expr.expression) && expr.expression.length > 0) {
        // Debug log
        if (process.env.DEBUG_FOR) {
          console.error('[DEBUG_FOR] Evaluating expression:', JSON.stringify(expr.expression, null, 2));
        }
        
        // Handle wrapped content structure (similar to for directive actions)
        // Don't unwrap templates with interpolation - they need to be evaluated as a whole
        let nodesToEvaluate = expr.expression;
        
        // Only unwrap if it's NOT a template requiring interpolation
        // Templates with hasInterpolation flag should be passed intact to evaluate()
        if (expr.expression.length === 1 && 
            expr.expression[0].content && 
            expr.expression[0].wrapperType &&
            !expr.expression[0].hasInterpolation) {
          // Only unwrap non-interpolated content
          nodesToEvaluate = expr.expression[0].content;
          if (process.env.DEBUG_FOR) {
            console.error('[DEBUG_FOR] Unwrapped non-interpolated content:', JSON.stringify(nodesToEvaluate, null, 2));
          }
        }
        
        // Evaluate all nodes
        const result = await evaluate(nodesToEvaluate, childEnv);
        if (process.env.DEBUG_FOR) {
          console.error('[DEBUG_FOR] Result:', result);
        }
        
        // Extract the actual value from Variables
        if (isVariable(result.value)) {
          exprResult = await extractVariableValue(result.value, childEnv);
        } else {
          exprResult = result.value;
        }
      }
      results.push(exprResult);
    } catch (error) {
      // Collect error with context
      errors.push({ 
        index: results.length, 
        error: error as Error, 
        value 
      });
      results.push(null);
    }
  }

  // Create ArrayVariable with metadata
  const metadata: any = {
    arrayType: 'for-expression-result',
    sourceExpression: expr.expression,
    iterationVariable: expr.variable.identifier
  };

  // If there are errors, attach them as metadata
  if (errors.length > 0) {
    metadata.forErrors = errors;
  }

  return createArrayVariable(
    'for-result',
    results,
    false, // Arrays from for expressions are not "complex"
    {
      directive: 'for',
      syntax: 'expression',
      hasInterpolation: false,
      isMultiLine: false
    },
    metadata
  );
}