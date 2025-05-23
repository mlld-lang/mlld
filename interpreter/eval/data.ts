import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { createDataVariable } from '@core/types';

/**
 * Evaluate @data directives.
 * The simplest evaluator - data is already parsed in the AST.
 * 
 * Ported from DataDirectiveHandler.
 */
export async function evaluateData(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Data directive missing identifier');
  }
  
  // Data is already parsed in the AST!
  const value = directive.values?.value;
  if (value === undefined) {
    throw new Error('Data directive missing value');
  }
  
  // Create and store the variable
  const variable = createDataVariable(identifier, value);
  env.setVariable(identifier, variable);
  
  // Return the parsed value
  return { value, env };
}