import { isContinueLiteral, isDoneLiteral } from '@core/types/control';
import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { asData, isStructuredValue, type StructuredValue } from '../utils/structured-value';
import { extractVariableValue, isVariable } from '../utils/variable-resolution';

export type ControlDefaultBehavior = 'carry' | 'keep';
export type DoneDefaultBehavior = 'state' | 'null';

export interface ControlResolutionOptions {
  defaultBehavior: ControlDefaultBehavior;
  retryMessage: string;
  doneDefault: DoneDefaultBehavior;
}

async function unwrapControlValue(value: unknown, env: Environment): Promise<unknown> {
  if (isVariable(value)) {
    return extractVariableValue(value, env);
  }
  return value;
}

export async function resolveControlValue(
  result: unknown,
  iterEnv: Environment,
  currentState: StructuredValue,
  options: ControlResolutionOptions
): Promise<{ kind: 'done' | 'continue'; value: unknown }> {
  const doneDefaultValue = options.doneDefault === 'null' ? null : currentState;
  const unwrapped = isStructuredValue(result) ? asData(result) : result;
  const controlPayload =
    unwrapped && typeof unwrapped === 'object' && '__whileControl' in (unwrapped as Record<string, unknown>)
      ? (unwrapped as Record<string, unknown>)
      : result && typeof result === 'object' && '__whileControl' in (result as Record<string, unknown>)
        ? (result as Record<string, unknown>)
        : null;

  if (controlPayload) {
    const controlKind = controlPayload.__whileControl === 'done' ? 'done' : 'continue';
    const controlValue = 'value' in controlPayload ? (controlPayload as any).value : undefined;
    if (controlKind === 'done' && controlValue === undefined) {
      return { kind: 'done', value: doneDefaultValue };
    }
    if (controlKind === 'continue' && controlValue === undefined) {
      return { kind: 'continue', value: currentState };
    }
    const resolvedValue = await unwrapControlValue(controlValue, iterEnv);
    return { kind: controlKind, value: resolvedValue };
  }

  if (unwrapped && typeof unwrapped === 'object' && 'valueType' in (unwrapped as Record<string, unknown>)) {
    if (isDoneLiteral(unwrapped as any)) {
      const val = (unwrapped as any).value;
      if (Array.isArray(val)) {
        const target = val.length === 1 ? val[0] : val;
        if (target && typeof target === 'object' && 'type' in (target as Record<string, unknown>)) {
          const evaluated = await evaluate(target as any, iterEnv, { isExpression: true });
          const resolvedValue = await unwrapControlValue(evaluated.value, iterEnv);
          return { kind: 'done', value: resolvedValue };
        }
        const evaluated = await evaluate(val as any, iterEnv, { isExpression: true });
        const resolvedValue = await unwrapControlValue(evaluated.value, iterEnv);
        return { kind: 'done', value: resolvedValue };
      }
      return { kind: 'done', value: val === 'done' ? doneDefaultValue : val };
    }
    if (isContinueLiteral(unwrapped as any)) {
      const val = (unwrapped as any).value;
      if (Array.isArray(val)) {
        const target = val.length === 1 ? val[0] : val;
        if (target && typeof target === 'object' && 'type' in (target as Record<string, unknown>)) {
          const evaluated = await evaluate(target as any, iterEnv, { isExpression: true });
          const resolvedValue = await unwrapControlValue(evaluated.value, iterEnv);
          return { kind: 'continue', value: resolvedValue };
        }
        const evaluated = await evaluate(val as any, iterEnv, { isExpression: true });
        const resolvedValue = await unwrapControlValue(evaluated.value, iterEnv);
        return { kind: 'continue', value: resolvedValue };
      }
      return { kind: 'continue', value: val === 'continue' ? currentState : val };
    }
    if ((unwrapped as any).valueType === 'retry') {
      throw new Error(options.retryMessage);
    }
  }

  if (unwrapped === 'retry') {
    throw new Error(options.retryMessage);
  }
  if (unwrapped === 'done') {
    return { kind: 'done', value: doneDefaultValue };
  }
  if (unwrapped === 'continue') {
    return { kind: 'continue', value: currentState };
  }

  const fallback =
    options.defaultBehavior === 'carry'
      ? isStructuredValue(result)
        ? result
        : unwrapped
      : currentState;

  return { kind: 'continue', value: fallback };
}
