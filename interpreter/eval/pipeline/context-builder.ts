/**
 * Simplified Context Builder for Pipeline Execution
 * 
 * Creates execution environments and pipeline context variables
 * for the simplified retry architecture.
 */

import type { Environment } from '../../env/Environment';
import type { PipelineStageEntry, VariableSource } from '@core/types';
import type { StageContext, PipelineEvent } from './state-machine';
import type { GuardHistoryEntry, PipelineContextSnapshot } from '../../env/ContextManager';
import { createPipelineInputVariable, createSimpleTextVariable, createObjectVariable, createStructuredValueVariable } from '@core/types/variable';
import { buildPipelineStructuredValue } from '../../utils/pipeline-input';
import { wrapStructured, isStructuredValue, type StructuredValue, type StructuredValueType } from '../../utils/structured-value';
import { inheritExpressionProvenance } from '../../utils/expression-provenance';

/**
 * Simplified pipeline context interface
 */
/**
 * User-facing pipeline context available as @pipeline/@p in stage environments.
 * WHY: Provide stage number, history, and convenience indexing for stage outputs.
 * GOTCHA: 'try' and 'tries' are local to the active retry context and reset downstream.
 */
export interface StageOutputAccessor {
  getStageOutput(stageIndex: number, fallbackText: string): StructuredValue;
}

export interface SimplifiedPipelineContext {
  try: number;                    // Current attempt number
  tries: string[];                // Previous attempts in current context
  stage: number;                  // Current stage (1-indexed)
  [index: number]: string | StructuredValue;        // Array access to pipeline outputs
  length: number;                 // Number of previous outputs
  retries?: {                     // Global retry accumulator
    all: Array<Array<string | StructuredValue>>;              // All attempts from all contexts
  };
  guards?: ReadonlyArray<GuardHistoryEntry>;
}

/**
 * Create execution environment for a pipeline stage (simplified version)
 */
/**
 * Create execution environment for a pipeline stage.
 * WHY: Constructs @input (with format), @pipeline/@p, and seeds the ambient @mx data.
 * CONTEXT: Hides the synthetic source stage from user-visible indices and stage numbers.
 */
interface StageEnvironmentOptions {
  capturePipelineContext?(context: PipelineContextSnapshot): void;
  skipSetPipelineContext?: boolean;
  sourceRetryable?: boolean;
}

export async function createStageEnvironment(
  command: PipelineStageEntry,
  input: string,
  structuredInput: StructuredValue,
  context: StageContext,
  env: Environment,
  format?: string,
  events?: ReadonlyArray<PipelineEvent>,
  hasSyntheticSource: boolean = false,
  allRetryHistory?: Map<string, StructuredValue[]>,
  structuredAccess?: StageOutputAccessor,
  options?: StageEnvironmentOptions
): Promise<Environment> {
  // Adjust stage number for synthetic source (hide from user)
  const rawId = (command as any)?.rawIdentifier || 'inline-stage';
  const userVisibleStage = hasSyntheticSource && rawId !== '__source__'
    ? context.stage - 1
    : context.stage;
    
  const userVisibleTotalStages = hasSyntheticSource 
    ? context.totalStages - 1 
    : context.totalStages;
    
  // Normalize hint value: ensure strings are plain strings and objects are plain objects
  let normalizedHint: any = context.currentHint;
  try {
    if (normalizedHint && typeof normalizedHint === 'object') {
      // Case 1: Template wrapper → interpolate to string
      if ('wrapperType' in normalizedHint && Array.isArray((normalizedHint as any).content)) {
        const { interpolate } = await import('../../core/interpreter');
        normalizedHint = await interpolate((normalizedHint as any).content, env);
      }
      // Case 2: AST/Variable → extract raw value
      else if ('type' in normalizedHint) {
        const { extractVariableValue } = await import('../../utils/variable-resolution');
        normalizedHint = await extractVariableValue(normalizedHint as any, env);
      }

      // If it's still an object, only keep it if it's a plain object
      if (normalizedHint && typeof normalizedHint === 'object') {
        const isPlain = Object.prototype.toString.call(normalizedHint) === '[object Object]'
          && !('wrapperType' in (normalizedHint as any))
          && !('type' in (normalizedHint as any))
          && !('nodeId' in (normalizedHint as any));
        if (!isPlain) {
          // Best-effort stringify to avoid leaking wrappers
          try {
            const { JSONFormatter } = await import('../../core/json-formatter');
            normalizedHint = JSONFormatter.stringify(normalizedHint);
          } catch {
            normalizedHint = String(normalizedHint);
          }
        }
      }
    }
    // Non-object, non-string → coerce to string
    if (normalizedHint !== undefined && normalizedHint !== null && typeof normalizedHint !== 'string' && typeof normalizedHint !== 'object') {
      normalizedHint = String(normalizedHint);
    }
  } catch {
    // Best-effort; keep original on failure
  }

  const pipelineContextSnapshot: PipelineContextSnapshot = {
    stage: userVisibleStage,
    totalStages: userVisibleTotalStages,
    currentCommand: rawId,
    input: context.currentStructuredInput ?? structuredInput ?? input,
    previousOutputs: context.previousStructuredOutputs && context.previousStructuredOutputs.length > 0
      ? context.previousStructuredOutputs
      : context.previousOutputs,
    format: format,
    // Use context-local attempt for ambient @mx.try
    attemptCount: context.contextAttempt,
    // Preserve attempts history for @mx.tries
    attemptHistory: context.historyStructured && context.historyStructured.length > 0
      ? context.historyStructured
      : context.history,
    // Provide hint info for ambient @mx.hint
    hint: normalizedHint,
    hintHistory: context.hintHistory || [],
    sourceRetryable: options?.sourceRetryable ?? false,
    guards: env.getPipelineGuardHistory()
  };

  options?.capturePipelineContext?.(pipelineContextSnapshot);

  if (!options?.skipSetPipelineContext) {
    env.setPipelineContext(pipelineContextSnapshot);
  }

  // Create child environment
  const stageEnv = env.createChild();
  
  // Set @input variable
  const pipelineInputWrapper = wrapStructured(structuredInput);
  inheritExpressionProvenance(pipelineInputWrapper, structuredInput);
  await setSimplifiedInputVariable(stageEnv, input, pipelineInputWrapper, format);
  
  // Set @pipeline / @p variable
  setSimplifiedPipelineVariable(
    stageEnv, 
    context, 
    events, 
    hasSyntheticSource,
    allRetryHistory,
    structuredAccess
  );
  
  return stageEnv;
}

/**
 * Set the @input variable (same as original)
 */
async function setSimplifiedInputVariable(
  env: Environment,
  input: string,
  structuredInput?: StructuredValue,
  format?: string
): Promise<void> {
  const inputSource: VariableSource = {
    directive: 'var',
    syntax: 'template',
    hasInterpolation: false,
    isMultiLine: false
  };

  let inputVar;

  if (format) {
    const pipelineInputObj = buildPipelineStructuredValue(input, format as StructuredValueType);
    
    inputVar = createPipelineInputVariable(
      'input',
      pipelineInputObj,
      format as 'json' | 'csv' | 'xml' | 'text',
      input,
      inputSource,
      1
    );
    inputVar.internal = {
      ...(inputVar.internal ?? {}),
      isSystem: true,
      isPipelineParameter: true
    };
  } else if (structuredInput && isStructuredValue(structuredInput)) {
    const structuredVar = createStructuredValueVariable(
      'input',
      structuredInput,
      inputSource,
      {
        mx: {},
        internal: { isSystem: true, isPipelineParameter: true }
      }
    );
    env.setParameterVariable('input', structuredVar);
    return;
  } else {
    // Simple text variable
    inputVar = createSimpleTextVariable(
      'input',
      input,
      inputSource,
      {
        mx: {},
        internal: { isSystem: true, isPipelineParameter: true }
      }
    );
  }

  env.setParameterVariable('input', inputVar);
}

/**
 * Set the @pipeline/@p variable (simplified version)
 */
function setSimplifiedPipelineVariable(
  env: Environment,
  context: StageContext,
  events?: ReadonlyArray<PipelineEvent>,
  hasSyntheticSource: boolean = false,
  allRetryHistory?: Map<string, StructuredValue[]>,
  structuredAccess?: StageOutputAccessor
): void {
  const pipelineContext = createSimplifiedPipelineContext(
    context,
    events,
    hasSyntheticSource,
    allRetryHistory,
    structuredAccess,
    () => env.getPipelineGuardHistory()
  );
  
  const inputSource: VariableSource = {
    directive: 'var',
    syntax: 'template',
    hasInterpolation: false,
    isMultiLine: false
  };

  // Use proper factory to create variable
  const pipelineVar = createObjectVariable(
    'pipeline',
    pipelineContext,
    false,
    inputSource,
    {
      mx: {},
      internal: { isSystem: true, isPipelineContext: true }
    }
  );
  
  env.setParameterVariable('pipeline', pipelineVar);
  env.setParameterVariable('p', pipelineVar); // Alias
}

/**
 * Create simplified pipeline context object
 */
function createSimplifiedPipelineContext(
  context: StageContext,
  events?: ReadonlyArray<PipelineEvent>,
  hasSyntheticSource: boolean = false,
  allRetryHistory?: Map<string, StructuredValue[]>,
  structuredAccess?: StageOutputAccessor,
  guardHistoryProvider?: () => ReadonlyArray<GuardHistoryEntry>
): SimplifiedPipelineContext {
  const userVisibleStage = hasSyntheticSource && context.stage > 0 
    ? context.stage - 1 
    : context.stage;

  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[SimplifiedContextBuilder] Creating context:', {
      internalStage: context.stage,
      userVisibleStage,
      contextAttempt: context.contextAttempt,
      historyLength: context.history.length,
      hasSyntheticSource
    });
  }

  const toStructured = (stageIndex: number | null, fallback: string): StructuredValue => {
    if (stageIndex !== null && structuredAccess) {
      return structuredAccess.getStageOutput(stageIndex, fallback ?? '');
    }
    return buildPipelineStructuredValue(fallback ?? '', 'text');
  };

  const baseInput = context.outputs?.[0] ?? '';
  const baseWrapper = toStructured(-1, baseInput);

  const stageWrappers = context.previousOutputs.map((output, index) =>
    toStructured(index, output)
  );

  const userVisibleWrappers = hasSyntheticSource && stageWrappers.length > 0
    ? stageWrappers.slice(1)
    : stageWrappers;

  const pipelineContext: any = {
    try: context.contextAttempt,
    stage: userVisibleStage,
    length: userVisibleWrappers.length
  };

  let triesText: unknown = [];
  let structuredTries: unknown = [];
  if (context.historyStructured && context.historyStructured.length > 0) {
    structuredTries = context.historyStructured.map(cloneStructuredValue);
    triesText = (structuredTries as StructuredValue[]).map(entry => entry.text);
  } else if (context.history.length > 0) {
    triesText = [...context.history];
    structuredTries = context.history.map(entry => toStructured(null, entry));
  } else if (allRetryHistory && allRetryHistory.size > 0) {
    const attempts = Array.from(allRetryHistory.values()).map(history =>
      history.map(attempt => cloneStructuredValue(attempt))
    );
    structuredTries = attempts;
    triesText = attempts.map(history => history.map(item => item.text));
  }

  pipelineContext.tries = triesText;
  Object.defineProperty(pipelineContext, 'structuredTries', {
    value: structuredTries,
    enumerable: false
  });
  pipelineContext[0] = baseWrapper;
  if (hasSyntheticSource) {
    userVisibleWrappers.forEach((wrapper, index) => {
      pipelineContext[index + 1] = wrapper;
    });
  } else {
    stageWrappers.forEach((wrapper, index) => {
      pipelineContext[index + 1] = wrapper;
    });
  }

  Object.defineProperty(pipelineContext, -1, {
    get: () => userVisibleWrappers[userVisibleWrappers.length - 1],
    enumerable: false
  });

  Object.defineProperty(pipelineContext, -2, {
    get: () => userVisibleWrappers[userVisibleWrappers.length - 2],
    enumerable: false
  });

  for (let i = 3; i <= Math.max(10, userVisibleWrappers.length); i++) {
    Object.defineProperty(pipelineContext, -i, {
      get: () => userVisibleWrappers[userVisibleWrappers.length - i],
      enumerable: false
    });
  }

  Object.defineProperty(pipelineContext, 'retries', {
    get: () => {
      if (!allRetryHistory || allRetryHistory.size === 0) {
        return { all: [] };
      }
      const allAttempts: Array<Array<StructuredValue>> = [];
      for (const attempts of allRetryHistory.values()) {
        if (attempts.length > 0) {
          const mapped = attempts.map(attempt => cloneStructuredValue(attempt));
          allAttempts.push(mapped);
        }
      }
      return { all: allAttempts };
    },
    enumerable: false,
    configurable: true
  });

  Object.defineProperty(pipelineContext, 'guards', {
    get: () => (guardHistoryProvider ? guardHistoryProvider() : []),
    enumerable: true,
    configurable: true
  });

  return pipelineContext as SimplifiedPipelineContext;
}

function cloneStructuredValue<T>(value: StructuredValue<T>): StructuredValue<T> {
  const clone = wrapStructured(value);
  inheritExpressionProvenance(clone, value);
  return clone;
}
