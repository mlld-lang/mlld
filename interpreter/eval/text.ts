import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createTextVariable } from '@core/types';

/**
 * Evaluate @text directives.
 * Handles variable interpolation and both = and += operators.
 * 
 * Ported from TextDirectiveHandler.
 */
export async function evaluateText(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Text directive missing identifier');
  }
  
  // Extract content nodes
  const contentNodes = directive.values?.content;
  if (!contentNodes || !Array.isArray(contentNodes)) {
    throw new Error('Text directive missing content');
  }
  
  // Interpolate the content (resolve {{variables}})
  const resolvedValue = await interpolate(contentNodes, env);
  
  // Handle append operator
  const operator = directive.operator || '=';
  let finalValue = resolvedValue;
  
  if (operator === '+=') {
    const existingVar = env.getVariable(identifier);
    if (existingVar && existingVar.type === 'text') {
      finalValue = existingVar.value + resolvedValue;
    }
  }
  
  // Create and store the variable
  const variable = createTextVariable(identifier, finalValue);
  env.setVariable(identifier, variable);
  
  // Return the value
  return { value: finalValue, env };
}