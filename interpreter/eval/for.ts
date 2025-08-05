import type { ForDirective, ForExpression, Environment, ArrayVariable, Variable } from '@core/types';
import { evaluate, interpolate, type EvalResult } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { createArrayVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { VariableImporter } from './import/VariableImporter';

// Helper to ensure a value is wrapped as a Variable
function ensureVariable(name: string, value: unknown): Variable {
  // If already a Variable, return as-is
  if (isVariable(value)) {
    return value;
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

  // Trace support
  env.pushDirective('/for', `@${varName} in ...`, directive.location);

  try {
    // Evaluate source collection
    const sourceResult = await evaluate(directive.values.source, env);
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
    for (const [key, value] of iterableArray) {
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
      
      
      for (const actionNode of actionNodes) {
        actionResult = await evaluate(actionNode, childEnv);
      }
      
      // Transfer output nodes from child to parent environment
      const childNodes = childEnv.getNodes();
      for (const node of childNodes) {
        env.addNode(node);
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
        let nodesToEvaluate = expr.expression;
        if (expr.expression.length === 1 && expr.expression[0].content && expr.expression[0].wrapperType) {
          // Unwrap the content
          nodesToEvaluate = expr.expression[0].content;
          if (process.env.DEBUG_FOR) {
            console.error('[DEBUG_FOR] Unwrapped to:', JSON.stringify(nodesToEvaluate, null, 2));
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