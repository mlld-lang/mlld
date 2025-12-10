import type { WhilePipelineStage } from '@core/types';
import { isContinueLiteral, isDoneLiteral } from '@core/types/control';
import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { wrapStructured, isStructuredValue, asData, type StructuredValue } from '../utils/structured-value';
import { createStructuredValueVariable, type VariableSource } from '@core/types/variable';
import { evaluateUnifiedExpression } from './expressions';

interface WhileContext {
  iteration: number;
  limit: number;
  active: boolean;
}

export type WhileProcessorInvoker = (
  processor: WhilePipelineStage['processor'],
  state: StructuredValue,
  env: Environment
) => Promise<{ value: unknown; env?: Environment }>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeState(value: unknown): StructuredValue {
  if (isStructuredValue(value)) {
    return value;
  }

  const textValue = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const kind: StructuredValue['type'] =
    Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text';
  return wrapStructured(value as any, kind, textValue);
}

async function setWhileInputVariable(env: Environment, value: unknown): Promise<void> {
  const source: VariableSource = {
    directive: 'var',
    syntax: 'template',
    hasInterpolation: false,
    isMultiLine: false
  };
  const wrapped: StructuredValue = isStructuredValue(value)
    ? value
    : wrapStructured(
        value as any,
        Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text',
        typeof value === 'string' ? value : undefined
      );
  const inputVar = createStructuredValueVariable('input', wrapped, source, {
    internal: { isSystem: true, isPipelineParameter: true }
  });
  env.setVariable('input', inputVar);
}

async function resolveControlValue(
  result: any,
  iterEnv: Environment,
  currentState: StructuredValue
): Promise<{ kind: 'done' | 'continue'; value: unknown }> {
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
    return { kind: controlKind, value: controlValue ?? currentState };
  }

  if (unwrapped && typeof unwrapped === 'object' && 'valueType' in (unwrapped as Record<string, unknown>)) {
    if (isDoneLiteral(unwrapped as any)) {
      const val = (unwrapped as any).value;
      if (Array.isArray(val)) {
        const target = val.length === 1 ? val[0] : val;
        if (target && typeof target === 'object' && 'type' in (target as Record<string, unknown>)) {
          const evaluated = await evaluateUnifiedExpression(target as any, iterEnv);
          return { kind: 'done', value: evaluated.value };
        }
        const evaluated = await evaluate(val as any, iterEnv, { isExpression: true });
        return { kind: 'done', value: evaluated.value };
      }
      return { kind: 'done', value: val === 'done' ? currentState : val };
    }
    if (isContinueLiteral(unwrapped as any)) {
      const val = (unwrapped as any).value;
      if (Array.isArray(val)) {
        const target = val.length === 1 ? val[0] : val;
        if (target && typeof target === 'object' && 'type' in (target as Record<string, unknown>)) {
          const evaluated = await evaluateUnifiedExpression(target as any, iterEnv);
          return { kind: 'continue', value: evaluated.value };
        }
        const evaluated = await evaluate(val as any, iterEnv, { isExpression: true });
        return { kind: 'continue', value: evaluated.value };
      }
      return { kind: 'continue', value: val === 'continue' ? currentState : val };
    }
    if ((unwrapped as any).valueType === 'retry') {
      throw new Error("Use 'continue' instead of 'retry' in while processors");
    }
  }

  if (unwrapped === 'retry') {
    throw new Error("Use 'continue' instead of 'retry' in while processors");
  }
  if (unwrapped === 'done') {
    return { kind: 'done', value: currentState };
  }
  if (unwrapped === 'continue') {
    return { kind: 'continue', value: currentState };
  }

  return { kind: 'continue', value: isStructuredValue(result) ? result : unwrapped };
}

export async function evaluateWhileStage(
  stage: WhilePipelineStage,
  input: StructuredValue,
  env: Environment,
  invokeProcessor?: WhileProcessorInvoker
): Promise<unknown> {
  const cap = stage.cap;
  const rateMs = stage.rateMs ?? null;

  let state: StructuredValue = normalizeState(input);

  for (let iteration = 1; iteration <= cap; iteration++) {
    const whileCtx: WhileContext = {
      iteration,
      limit: cap,
      active: true
    };

    const iterEnv = env.createChild();
    await setWhileInputVariable(iterEnv, state);

    const evalResult = await iterEnv.withExecutionContext('while', whileCtx, async () => {
      if (invokeProcessor) {
        return invokeProcessor(stage.processor, state, iterEnv);
      }
      return evaluate(stage.processor as any, iterEnv, { isExpression: true });
    });

    const value =
      evalResult && typeof evalResult === 'object' && 'env' in (evalResult as Record<string, unknown>)
        ? (evalResult as any).value
        : evalResult;
    const resultEnv =
      evalResult && typeof evalResult === 'object' && 'env' in (evalResult as Record<string, unknown>)
        ? (evalResult as any).env || iterEnv
        : iterEnv;

    const control = await resolveControlValue(value, resultEnv || iterEnv, state);

    if (control.kind === 'done') {
      return control.value;
    }

    state = normalizeState(control.value);

    if (rateMs && iteration < cap) {
      await sleep(rateMs);
    }
  }

  throw new Error(
    `While loop reached cap (${cap}) without 'done'. Consider increasing cap or check termination logic.`
  );
}
