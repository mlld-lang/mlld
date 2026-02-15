import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import type { Environment } from '../../../env/Environment';
import type { VariableSource } from '@core/types';
import type { Variable } from '@core/types/variable/VariableTypes';
import {
  createArrayVariable,
  createObjectVariable,
  createPipelineInputVariable,
  createPrimitiveVariable,
  createSimpleTextVariable
} from '@core/types/variable';
import { createPipelineParameterVariable } from '../../../utils/parameter-factory';
import { buildPipelineStructuredValue } from '../../../utils/pipeline-input';
import type { StructuredValue, StructuredValueType } from '../../../utils/structured-value';
import { isStructuredValue } from '../../../utils/structured-value';
import {
  parseStructuredJson,
  shouldAutoParsePipelineInput,
  wrapPipelineStructuredValue
} from './structured-input';

function createTypedPipelineVariable(
  paramName: string,
  parsedValue: any,
  originalText: string
): Variable {
  const pipelineSource: VariableSource = {
    directive: 'var',
    syntax: 'pipeline',
    hasInterpolation: false,
    isMultiLine: false
  };
  const internal: Record<string, any> = {
    isPipelineParameter: true,
    pipelineOriginal: originalText,
    pipelineFormat: 'json'
  };

  if (Array.isArray(parsedValue)) {
    const bridged = wrapPipelineStructuredValue(parsedValue, originalText);
    internal.pipelineType = 'array';
    internal.customToString = () => originalText;
    return createArrayVariable(paramName, bridged, false, pipelineSource, { internal });
  }

  if (parsedValue && typeof parsedValue === 'object') {
    const bridged = wrapPipelineStructuredValue(parsedValue, originalText);
    internal.pipelineType = 'object';
    internal.customToString = () => originalText;
    return createObjectVariable(paramName, bridged as Record<string, any>, false, pipelineSource, { internal });
  }

  if (
    parsedValue === null ||
    typeof parsedValue === 'number' ||
    typeof parsedValue === 'boolean'
  ) {
    internal.pipelineType = parsedValue === null ? 'null' : typeof parsedValue;
    return createPrimitiveVariable(
      paramName,
      parsedValue as number | boolean | null,
      {
        directive: 'var',
        syntax: 'literal',
        hasInterpolation: false,
        isMultiLine: false
      },
      { internal }
    );
  }

  const textSource: VariableSource = {
    directive: 'var',
    syntax: 'quoted',
    hasInterpolation: false,
    isMultiLine: false
  };
  return createSimpleTextVariable(paramName, originalText, textSource, {
    internal: { isPipelineParameter: true }
  });
}

interface AssignPipelineParameterOptions {
  name: string;
  value: unknown;
  originalVariable?: Variable;
  pipelineStage?: number;
  isPipelineInput?: boolean;
  markPipelineContext?: boolean;
}

function assignPipelineParameter(
  targetEnv: Environment,
  options: AssignPipelineParameterOptions
): void {
  const variable = createPipelineParameterVariable({
    name: options.name,
    value: options.value,
    origin: 'pipeline',
    originalVariable: options.originalVariable,
    allowOriginalReuse: Boolean(options.originalVariable),
    pipelineStage: options.pipelineStage,
    isPipelineInput: options.isPipelineInput
  });

  if (!variable) {
    return;
  }

  if (options.markPipelineContext) {
    variable.internal = {
      ...(variable.internal ?? {}),
      isPipelineContext: true
    };
  }

  targetEnv.setParameterVariable(options.name, variable);
}

export function normalizePipelineParameterValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return '';
  }
  if (isStructuredValue(value)) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object') {
    const candidate = value as { type?: string; content?: unknown };
    if (candidate && candidate.type === 'Text' && candidate.content !== undefined) {
      return candidate.content;
    }
    if (candidate && candidate.content !== undefined) {
      return candidate.content;
    }
    return value;
  }
  return String(value);
}

function isPipelineContextCandidate(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'stage' in (value as Record<string, unknown>));
}

export interface BindPipelineParametersOptions {
  env: Environment;
  execEnv: Environment;
  paramNames: string[];
  baseParamNames: string[];
  boundArgs: unknown[];
  args: unknown[];
  stdinInput?: string;
  structuredInput?: StructuredValue;
  stageLanguage?: string;
}

export interface BindPipelineParametersResult {
  pipelineCtx: PipelineContextSnapshot | undefined;
  format: string | undefined;
}

export async function bindPipelineParameters(
  options: BindPipelineParametersOptions
): Promise<BindPipelineParametersResult> {
  const {
    env,
    execEnv,
    paramNames,
    baseParamNames,
    boundArgs,
    args,
    stdinInput,
    structuredInput,
    stageLanguage
  } = options;

  const pipelineCtx = env.getPipelineContext();
  const format = pipelineCtx?.format;

  if (paramNames.length > 0) {
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i];
      const argIndex = pipelineCtx !== undefined && stdinInput !== undefined ? i - 1 : i;
      const argValue = argIndex >= 0 && argIndex < args.length ? args[argIndex] : null;
      const isPipelineParam = i === 0 && pipelineCtx !== undefined && stdinInput !== undefined;

      if (isPipelineParam) {
        const { AutoUnwrapManager } = await import('../../auto-unwrap-manager');
        const textValue = structuredInput ? structuredInput.text : (stdinInput ?? '');
        const unwrapSource = structuredInput ?? textValue;
        const unwrappedStdin = AutoUnwrapManager.unwrap(unwrapSource);

        const hasNativeStructuredInput =
          structuredInput && structuredInput.type && structuredInput.type !== 'text';

        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[DEBUG isPipelineParam]:', {
            paramName,
            structuredInputType: structuredInput?.type,
            hasNative: hasNativeStructuredInput,
            textValuePreview: textValue?.substring(0, 50)
          });
        }

        if (hasNativeStructuredInput) {
          const typedVar = createTypedPipelineVariable(paramName, structuredInput.data, textValue);
          assignPipelineParameter(execEnv, {
            name: paramName,
            value: typedVar.value,
            originalVariable: typedVar,
            pipelineStage: pipelineCtx?.stage,
            isPipelineInput: true
          });
          continue;
        }

        if (!format) {
          const shouldParse = shouldAutoParsePipelineInput(stageLanguage);
          if (shouldParse) {
            const candidate = typeof unwrappedStdin === 'string' ? unwrappedStdin : textValue;
            const parsed = parseStructuredJson(candidate);
            if (parsed !== null) {
              const typedVar = createTypedPipelineVariable(paramName, parsed, candidate);
              assignPipelineParameter(execEnv, {
                name: paramName,
                value: typedVar.value,
                originalVariable: typedVar,
                pipelineStage: pipelineCtx?.stage,
                isPipelineInput: true
              });
              continue;
            }
          }

          const resolvedText = typeof unwrappedStdin === 'string' ? unwrappedStdin : textValue;
          const textSource: VariableSource = {
            directive: 'var',
            syntax: 'quoted',
            hasInterpolation: false,
            isMultiLine: false
          };
          const textVar = createSimpleTextVariable(paramName, resolvedText, textSource, {
            internal: { isPipelineParameter: true }
          });
          assignPipelineParameter(execEnv, {
            name: paramName,
            value: textVar.value,
            originalVariable: textVar,
            pipelineStage: pipelineCtx?.stage,
            isPipelineInput: true
          });
          continue;
        }

        const resolvedText = typeof unwrappedStdin === 'string' ? unwrappedStdin : textValue;
        const wrappedInput = buildPipelineStructuredValue(resolvedText, format as StructuredValueType);
        const pipelineSource: VariableSource = {
          directive: 'var',
          syntax: 'template',
          hasInterpolation: false,
          isMultiLine: false
        };
        const pipelineVar = createPipelineInputVariable(
          paramName,
          wrappedInput,
          format as 'json' | 'csv' | 'xml' | 'text',
          resolvedText,
          pipelineSource,
          { internal: { pipelineStage: pipelineCtx?.stage } } as any
        );
        assignPipelineParameter(execEnv, {
          name: paramName,
          value: pipelineVar.value,
          originalVariable: pipelineVar,
          pipelineStage: pipelineCtx?.stage,
          isPipelineInput: true
        });
        continue;
      }

      const normalizedValue = normalizePipelineParameterValue(argValue);
      assignPipelineParameter(execEnv, {
        name: paramName,
        value: normalizedValue,
        pipelineStage: pipelineCtx?.stage,
        markPipelineContext: isPipelineContextCandidate(normalizedValue)
      });
    }
  }

  if (boundArgs.length > 0 && baseParamNames.length > 0) {
    for (let i = 0; i < boundArgs.length && i < baseParamNames.length; i++) {
      const paramName = baseParamNames[i];
      const normalizedValue = normalizePipelineParameterValue(boundArgs[i]);
      assignPipelineParameter(execEnv, {
        name: paramName,
        value: normalizedValue,
        pipelineStage: pipelineCtx?.stage,
        markPipelineContext: isPipelineContextCandidate(normalizedValue)
      });
    }
  }

  return {
    pipelineCtx,
    format
  };
}
