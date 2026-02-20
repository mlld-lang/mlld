import { MlldInterpreterError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import { normalizePipelineParameterValue } from '@interpreter/eval/pipeline/command-execution/bind-pipeline-params';
import {
  isEventEmitter,
  isLegacyStream,
  toJsValue,
  wrapNodeValue
} from '@interpreter/utils/node-interop';

export type FinalizeResult = (
  value: unknown,
  options?: { type?: string; text?: string }
) => unknown;

export interface ExecuteNodeHandlerOptions {
  execDef: any;
  execEnv: Environment;
  commandVar: any;
  args: any[];
  boundArgs: any[];
  baseParamNames: string[];
  pipelineCtx?: unknown;
  stdinInput?: string;
  structuredInput?: StructuredValue;
  errorLocation?: SourceLocation;
  finalizeResult: FinalizeResult;
}

export async function executeNodeHandler(
  options: ExecuteNodeHandlerOptions
): Promise<unknown> {
  const {
    execDef,
    execEnv,
    commandVar,
    args,
    boundArgs,
    baseParamNames,
    pipelineCtx,
    stdinInput,
    structuredInput,
    errorLocation,
    finalizeResult
  } = options;

  if (execDef.type === 'nodeClass') {
    throw new MlldInterpreterError(
      `Node class '${commandVar?.name ?? 'anonymous'}' requires new`,
      'exec',
      errorLocation ?? commandVar?.mx?.definedAt
    );
  }

  let callArgs: unknown[];
  if (baseParamNames.length > 0) {
    callArgs = baseParamNames.map(paramName => execEnv.getVariable(paramName)?.value);
  } else {
    callArgs = [...boundArgs];
    if (pipelineCtx !== undefined && stdinInput !== undefined) {
      callArgs.push(structuredInput ?? stdinInput);
    }
    callArgs.push(...args.map(arg => normalizePipelineParameterValue(arg)));
  }

  const jsArgs = callArgs.map(arg => toJsValue(arg));
  let output = execDef.fn.apply(execDef.thisArg ?? undefined, jsArgs);
  if (output && typeof output === 'object' && typeof (output as any).then === 'function') {
    output = await output;
  }

  if (isEventEmitter(output) && !(output && typeof (output as any).then === 'function')) {
    throw new MlldInterpreterError(
      `Node function '${commandVar?.name ?? 'anonymous'}' returns an EventEmitter and requires subscriptions`,
      'exec',
      errorLocation ?? commandVar?.mx?.definedAt
    );
  }
  if (isLegacyStream(output)) {
    throw new MlldInterpreterError(
      `Node function '${commandVar?.name ?? 'anonymous'}' returns a legacy stream without async iterator support`,
      'exec',
      errorLocation ?? commandVar?.mx?.definedAt
    );
  }

  const wrapped = wrapNodeValue(output, { moduleName: execDef.moduleName });
  return finalizeResult(wrapped);
}
