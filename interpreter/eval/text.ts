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
  
  // Check if this is a run source (e.g., @text result = @run [echo "hello"])
  let resolvedValue: string;
  
  if (directive.source === 'run') {
    // The content should be the command to run
    const command = await interpolate(contentNodes, env);
    // Execute the command and use the output as the value
    resolvedValue = await env.executeCommand(command);
    // Trim trailing newlines for consistency
    resolvedValue = resolvedValue.replace(/\n+$/, '');
  } else {
    // Normal case: interpolate the content (resolve {{variables}})
    resolvedValue = await interpolate(contentNodes, env);
  }
  
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