import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { Variable } from '@core/types/variable';

/**
 * Extract and evaluate directive inputs for hook consumption.
 * Implementation is incremental per directive; directives without
 * explicit handling currently return an empty array.
 */
export async function extractDirectiveInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  switch (directive.kind) {
    case 'show':
      return extractShowInputs(directive, env);

    default:
      return [];
  }
}

async function extractShowInputs(
  directive: DirectiveNode,
  env: Environment
): Promise<readonly Variable[]> {
  const inputs: Variable[] = [];
  const varName = resolveShowVariableName(directive);
  if (!varName) {
    return inputs;
  }
  const variable = env.getVariable(varName);
  if (variable) {
    inputs.push(variable);
  }
  return inputs;
}

function resolveShowVariableName(directive: DirectiveNode): string | undefined {
  const invocation = directive.values?.invocation?.[0];
  if (invocation) {
    if (invocation.type === 'VariableReference') {
      return invocation.identifier;
    }
    if (invocation.type === 'VariableReferenceWithTail' && invocation.variable) {
      const innerVar = invocation.variable;
      if (innerVar.type === 'VariableReference') {
        return innerVar.identifier;
      }
      if (innerVar.type === 'TemplateVariable') {
        return innerVar.identifier;
      }
    }
    if (invocation.type === 'TemplateVariable') {
      return invocation.identifier;
    }
  }

  const legacyVariable = directive.values?.variable?.[0];
  if (legacyVariable && typeof legacyVariable === 'object' && 'identifier' in legacyVariable) {
    return (legacyVariable as { identifier?: string }).identifier;
  }

  return undefined;
}
