import type { WhilePipelineStage } from '@core/types';
import type { Environment } from '../env/Environment';
import { evaluate } from '../core/interpreter';
import { wrapStructured, isStructuredValue, type StructuredValue } from '../utils/structured-value';
import { createStructuredValueVariable, type VariableSource } from '@core/types/variable';
import { resolveControlValue } from './control-flow';

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

    const control = await resolveControlValue(value, resultEnv || iterEnv, state, {
      defaultBehavior: 'carry',
      retryMessage: "Use 'continue' instead of 'retry' in while processors",
      doneDefault: 'state'
    });

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
