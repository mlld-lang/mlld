/**
 * Context Builder for Pipeline Execution
 * 
 * Creates execution environments and @ctx context variable
 * for the new @ctx architecture.
 */

import type { Environment } from '../../env/Environment';
import type { PipelineCommand, VariableSource } from '@core/types';
import type { StageContext, PipelineEvent } from './state-machine';
import type { UniversalContext } from '@core/universal-context';
import { createPipelineInputVariable, createSimpleTextVariable, createObjectVariable } from '@core/types/variable';
import { createPipelineInput } from '../../utils/pipeline-input';

/**
 * Create execution environment for a pipeline stage
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
  // Adjust stage numbers for user visibility
  // Internal stage 0 (source) should appear as stage 1 to users
  const userVisibleStage = context.stage + 1;
  const userVisibleTotalStages = context.totalStages;
    
  // Set pipeline context in main environment
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[ContextBuilder] setPipelineContext:', {
      stage: userVisibleStage,
      contextAttempt: context.contextAttempt,
      historyLength: context.history.length
    });
  }
  
  env.setPipelineContext({
    stage: userVisibleStage,
    totalStages: userVisibleTotalStages,
    currentCommand: command.rawIdentifier,
    input: input,
    previousOutputs: context.previousOutputs,
    format: format,
    try: context.contextAttempt,
    tries: context.history
  });

  // Create child environment
  const stageEnv = env.createChild();
  
  // Set @input variable
  await setInputVariable(stageEnv, input, format);
  
  // Set @ctx variable (only in legacy mode)
  await setContextVariable(
    stageEnv, 
    context, 
    input,
    events, 
    hasSyntheticSource,
    allRetryHistory
  );
  
  return stageEnv;
}

/**
 * Set the @input variable
 */
async function setInputVariable(
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
 * Set the @ctx variable (legacy mode only)
 */
async function setContextVariable(
  env: Environment,
  context: StageContext,
  input: any,
  events?: ReadonlyArray<PipelineEvent>,
  hasSyntheticSource: boolean = false,
  allRetryHistory?: Map<string, string[]>
): Promise<void> {
  // Check if universal context is enabled
  const { USE_UNIVERSAL_CONTEXT } = await import('@core/feature-flags');
  
  if (USE_UNIVERSAL_CONTEXT) {
    // When universal context is enabled, @ctx is provided globally
    // Don't create a local @ctx variable that would override it
    return;
  }
  
  // Legacy mode: create @ctx variable directly
  const ctxObject = createContextObject(
    context,
    input,
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

  // Create @ctx as read-only system variable
  const ctxVar = createObjectVariable(
    'ctx',
    ctxObject,
    true,  // read-only
    inputSource,
    {
      isSystem: true,
      isContext: true
    }
  );
  
  env.setParameterVariable('ctx', ctxVar);
}

/**
 * Create context object for @ctx variable
 */
function createContextObject(
  context: StageContext,
  input: any,
  events?: ReadonlyArray<PipelineEvent>,
  hasSyntheticSource: boolean = false,
  allRetryHistory?: Map<string, string[]>
): Partial<UniversalContext> {
  // Build tries array from history
  const tries = context.history.map((output, index) => ({
    attempt: index + 1,
    result: 'retry' as const,  // Previous attempts resulted in retry
    hint: context.hints?.[index] || undefined,
    output
  }));
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[ContextBuilder] Creating @ctx:', {
      stage: context.stage,
      try: context.contextAttempt,
      triesCount: tries.length,
      hint: context.hint,
      isPipeline: true
    });
  }
  
  // Build @ctx object according to spec
  const ctxObject: Partial<UniversalContext> = {
    // Core fields (1-based indexing)
    try: context.contextAttempt,
    tries,
    stage: context.stage,  // Keep 0-based internally
    isPipeline: true,
    
    // Retry communication
    hint: context.hint || null,
    lastOutput: context.history.length > 0 
      ? context.history[context.history.length - 1] 
      : null,
    
    // Input/output
    input
  };

  return ctxObject;
}