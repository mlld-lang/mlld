/**
 * Simplified Context Builder for Pipeline Execution
 * 
 * Creates execution environments and pipeline context variables
 * for the simplified retry architecture.
 */

import type { Environment } from '../../env/Environment';
import type { PipelineCommand, VariableSource } from '@core/types';
import type { StageContext, PipelineEvent } from './state-machine';
import { createPipelineInputVariable, createSimpleTextVariable, createObjectVariable } from '@core/types/variable';
import { createPipelineInput } from '../../utils/pipeline-input';

/**
 * Simplified pipeline context interface
 */
export interface SimplifiedPipelineContext {
  try: number;                    // Current attempt number
  tries: string[];                // Previous attempts in current context
  stage: number;                  // Current stage (1-indexed)
  [index: number]: string;        // Array access to pipeline outputs
  length: number;                 // Number of previous outputs
  retries?: {                     // Global retry accumulator
    all: string[][];              // All attempts from all contexts
  };
}

/**
 * Create execution environment for a pipeline stage (simplified version)
 */
export async function createStageEnvironment(
  command: PipelineCommand,
  input: string,
  context: StageContext,
  env: Environment,
  format?: string,
  events?: ReadonlyArray<PipelineEvent>,
  hasSyntheticSource: boolean = false,
  allRetryHistory?: Map<string, string[]>
): Promise<Environment> {
  // Adjust stage number for synthetic source (hide from user)
  const userVisibleStage = hasSyntheticSource && command.rawIdentifier !== '__source__'
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

  // Set pipeline context in main environment
  env.setPipelineContext({
    stage: userVisibleStage,
    internalStage: context.stage,
    totalStages: userVisibleTotalStages,
    currentCommand: command.rawIdentifier,
    input: input,
    previousOutputs: context.previousOutputs,
    format: format,
    // Use context-local attempt for ambient @ctx.try
    attemptCount: context.contextAttempt,
    // Preserve attempts history for @ctx.tries
    attemptHistory: context.history,
    // Provide hint info for ambient @ctx.hint
    hint: normalizedHint,
    hintHistory: context.hintHistory || []
  });

  // Create child environment
  const stageEnv = env.createChild();
  
  // Set @input variable
  await setSimplifiedInputVariable(stageEnv, input, format);
  
  // Set @pipeline / @p variable
  setSimplifiedPipelineVariable(
    stageEnv, 
    context, 
    events, 
    hasSyntheticSource,
    allRetryHistory
  );
  
  return stageEnv;
}

/**
 * Set the @input variable (same as original)
 */
async function setSimplifiedInputVariable(
  env: Environment, 
  input: string, 
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
    // Create PipelineInput with format
    const pipelineInputObj = createPipelineInput(input, format);
    
    inputVar = createPipelineInputVariable(
      'input',
      pipelineInputObj,
      format as 'json' | 'csv' | 'xml' | 'text',
      input,
      inputSource,
      1,
      {
        isSystem: true,
        isPipelineInput: true
      }
    );
  } else {
    // Simple text variable
    inputVar = createSimpleTextVariable(
      'input',
      input,
      inputSource,
      {
        isSystem: true,
        isPipelineParameter: true
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
  allRetryHistory?: Map<string, string[]>
): void {
  const pipelineContext = createSimplifiedPipelineContext(
    context,
    events,
    hasSyntheticSource,
    allRetryHistory
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
      isPipelineContext: true,
      isSystem: true
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
  allRetryHistory?: Map<string, string[]>
): SimplifiedPipelineContext {
  // Adjust for synthetic source
  const userVisibleStage = hasSyntheticSource && context.stage > 0 
    ? context.stage - 1 
    : context.stage;
    
  // Filter out synthetic source from outputs
  const userVisibleOutputs = hasSyntheticSource && context.previousOutputs.length > 0
    ? context.previousOutputs.slice(1)
    : context.previousOutputs;
    
  // Build outputs object
  const outputs: any = {};
  if (hasSyntheticSource) {
    // Shift indices to hide synthetic source
    Object.entries(context.outputs).forEach(([key, value]) => {
      const index = parseInt(key);
      if (!isNaN(index) && index > 0) {
        outputs[index - 1] = value;
      }
    });
  } else {
    Object.assign(outputs, context.outputs);
  }
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[SimplifiedContextBuilder] Creating context:', {
      internalStage: context.stage,
      userVisibleStage,
      contextAttempt: context.contextAttempt,
      historyLength: context.history.length,
      hasSyntheticSource
    });
  }
  
  // Build basic context
  const pipelineContext: any = {
    // Core fields
    try: context.contextAttempt,
    tries: context.history,
    stage: userVisibleStage,
    length: userVisibleOutputs.length,
    
    // Array-style access
    ...outputs
  };

  // Add negative indexing
  Object.defineProperty(pipelineContext, -1, {
    get: () => userVisibleOutputs[userVisibleOutputs.length - 1],
    enumerable: false
  });

  Object.defineProperty(pipelineContext, -2, {
    get: () => userVisibleOutputs[userVisibleOutputs.length - 2],
    enumerable: false
  });

  // Add more negative indices as needed
  for (let i = 3; i <= Math.max(10, userVisibleOutputs.length); i++) {
    Object.defineProperty(pipelineContext, -i, {
      get: () => userVisibleOutputs[userVisibleOutputs.length - i],
      enumerable: false
    });
  }

  // Add lazy-evaluated @pipeline.retries.all
  // This provides access to ALL retry attempts from ALL contexts
  Object.defineProperty(pipelineContext, 'retries', {
    get: () => {
      if (!allRetryHistory || allRetryHistory.size === 0) {
        return { all: [] };
      }
      
      // Collect all attempts from all contexts
      const allAttempts: string[][] = [];
      for (const attempts of allRetryHistory.values()) {
        if (attempts.length > 0) {
          allAttempts.push([...attempts]);
        }
      }
      
      return { all: allAttempts };
    },
    enumerable: false,
    configurable: true
  });

  return pipelineContext as SimplifiedPipelineContext;
}
