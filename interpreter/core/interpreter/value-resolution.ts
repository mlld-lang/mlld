import type { Variable } from '@core/types/variable';
import { interpreterLogger as logger } from '@core/utils/logger';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateDataValue } from '@interpreter/eval/data-value-evaluator';
import { asText, assertStructuredValue } from '@interpreter/utils/structured-value';

/**
 * Type for variable values resolved for interpolation/display.
 */
export type VariableValue =
  | string
  | number
  | boolean
  | null
  | VariableValue[]
  | { [key: string]: VariableValue };

/**
 * Resolve a variable to the runtime value shape used by interpreter helpers.
 */
export async function resolveVariableValue(variable: Variable, env: Environment): Promise<VariableValue> {
  const {
    isTextLike,
    isStructured,
    isPath,
    isPipelineInput,
    isExecutableVariable,
    isImported,
    isComputed,
    isPrimitive
  } = await import('@core/types/variable');

  if (isPrimitive(variable)) {
    return variable.value;
  }

  if (isTextLike(variable)) {
    return variable.value;
  }

  if (isStructured(variable)) {
    const complexFlag = (variable as any).isComplex;

    if (complexFlag) {
      const evaluatedValue = await evaluateDataValue(variable.value as any, env);
      return evaluatedValue as VariableValue;
    }

    return variable.value as VariableValue;
  }

  if (isPath(variable)) {
    return variable.value.resolvedPath;
  }

  if (isPipelineInput(variable)) {
    assertStructuredValue(variable.value, 'interpolate:pipeline-input');
    return asText(variable.value);
  }

  if (isExecutableVariable(variable)) {
    const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
    const invocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: variable.name,
        args: []
      }
    };
    const result = await evaluateExecInvocation(invocation as any, env);
    return result.value as VariableValue;
  }

  if (isImported(variable)) {
    return variable.value as VariableValue;
  }

  if (isComputed(variable)) {
    return variable.value as VariableValue;
  }

  return variable.value as VariableValue;
}
