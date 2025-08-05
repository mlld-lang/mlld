import type { ForDirective, ForExpression, Environment, ArrayVariable, Variable } from '@core/types';
import { evaluate, type EvalResult } from '../core/interpreter';
import { MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { createArrayVariable } from '@core/types/variable';
import { isVariable } from '../utils/variable-resolution';
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

      // Evaluate action in child environment
      await evaluate(directive.values.action, childEnv);
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
      const result = await evaluate(expr.expression, childEnv);
      results.push(result.value);
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