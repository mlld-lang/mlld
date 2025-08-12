import type { Environment } from '../../env/Environment';
import type { PipelineCommand, VariableSource } from '@core/types';
import type { StageContext, PipelineEvent } from './state-machine';
import { createPipelineInputVariable, createSimpleTextVariable, createObjectVariable } from '@core/types/variable';
import { createPipelineInput } from '../../utils/pipeline-input';

/**
 * Interface-level pipeline context for @pipeline variable
 */
export interface InterfacePipelineContext {
  try: number;                    // This stage's attempt number
  tries: string[];               // This stage's previous attempts
  stage: number;                 // Current stage number (1-indexed)
  [index: number]: string;       // Indexed access to pipeline outputs
  length: number;                // Number of previous outputs
  all?: {                        // Global accumulator (lazy-evaluated)
    tries: string[][]            // All attempts across all contexts
  };
  [name: string]: any;           // Dynamic properties from stage variables
}

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
  hasSyntheticSource: boolean = false
): Promise<Environment> {
  // Adjust stage number if we have a synthetic source (hide it from user)
  // The state machine provides 1-indexed stages, so:
  // - Without synthetic: stage 0 → 1, stage 1 → 2, etc.
  // - With synthetic: __source__ (0) → 1, first user stage → 2
  // For synthetic source, we hide stage 0 completely:
  // - __source__ (internal 0, context.stage 1) → hidden, but if shown would be 0
  // - testRetry (internal 1, context.stage 2) → show as stage 1
  const userVisibleStage = hasSyntheticSource && command.rawIdentifier !== '__source__'
    ? context.stage - 1  // Subtract 1 for real stages to account for hidden __source__
    : context.stage;
  const userVisibleTotalStages = hasSyntheticSource 
    ? context.totalStages - 1 
    : context.totalStages;
    
  // Set pipeline context in main environment
  env.setPipelineContext({
    stage: userVisibleStage,
    totalStages: userVisibleTotalStages,
    currentCommand: command.rawIdentifier,
    input: input,
    previousOutputs: context.previousOutputs,
    format: format,
    attemptCount: context.attempt,
    attemptHistory: context.history
  });

  // Create child environment with variables
  const stageEnv = env.createChild();
  
  // Set @input variable
  await setInputVariable(stageEnv, input, format);
  
  // Set @pipeline / @p variable with context
  setPipelineVariable(stageEnv, context, events, hasSyntheticSource);
  
  return stageEnv;
}

/**
 * Set the @input variable in the stage environment
 */
async function setInputVariable(env: Environment, input: string, format?: string): Promise<void> {
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
      1, // stage number - will be updated by pipeline context
      {
        isSystem: true,
        isPipelineInput: true
      }
    );
  } else {
    // No format - create simple text variable for backwards compatibility
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
 * Set the @pipeline/@p variable in the stage environment
 */
function setPipelineVariable(env: Environment, context: StageContext, events?: ReadonlyArray<PipelineEvent>, hasSyntheticSource: boolean = false): void {
  const interfaceContext = createInterfacePipelineContext(context, events, hasSyntheticSource);
  
  const inputSource: VariableSource = {
    directive: 'var',
    syntax: 'template',
    hasInterpolation: false,
    isMultiLine: false
  };

  const pipelineVar = createPipelineContextVariable('pipeline', interfaceContext, inputSource);
  env.setParameterVariable('pipeline', pipelineVar);
  
  // Also set @p as an alias
  env.setParameterVariable('p', pipelineVar);
}

/**
 * Create clean interface context from stage context
 */
function createInterfacePipelineContext(context: StageContext, events?: ReadonlyArray<PipelineEvent>, hasSyntheticSource: boolean = false): InterfacePipelineContext {
  // Adjust stage number and outputs if we have a synthetic source
  const userVisibleStage = hasSyntheticSource && context.stage > 0 
    ? context.stage - 1 
    : context.stage;
    
  // Filter out synthetic source output from previousOutputs if present
  const userVisibleOutputs = hasSyntheticSource && context.previousOutputs.length > 0
    ? context.previousOutputs.slice(1) // Skip first output (from __source__)
    : context.previousOutputs;
    
  // Create outputs object without the synthetic source stage
  const outputs: any = {};
  if (hasSyntheticSource) {
    // Shift indices down by 1 to hide synthetic source
    Object.entries(context.outputs).forEach(([key, value]) => {
      const index = parseInt(key);
      if (!isNaN(index) && index > 0) {
        outputs[index - 1] = value;
      }
    });
  } else {
    Object.assign(outputs, context.outputs);
  }
  
  console.log('📊 PIPELINE CONTEXT:', {
    internalStage: context.stage,
    userVisibleStage,
    attempt: context.attempt,
    contextAttempt: context.contextAttempt,
    hasSyntheticSource,
    history: context.history,
    historyLength: context.history.length
  });
  
  const interfaceContext: any = {
    // Stage-specific data
    try: context.contextAttempt,  // Use contextAttempt for retry count within current context
    tries: context.history,
    stage: userVisibleStage,
    
    // Pipeline data access
    length: userVisibleOutputs.length,
    
    // Array-style access to outputs
    ...outputs
  };

  // Add negative indexing support
  Object.defineProperty(interfaceContext, -1, {
    get: () => userVisibleOutputs[userVisibleOutputs.length - 1],
    enumerable: false
  });

  Object.defineProperty(interfaceContext, -2, {
    get: () => userVisibleOutputs[userVisibleOutputs.length - 2],
    enumerable: false
  });

  // Add more negative indices as needed
  for (let i = 3; i <= Math.max(10, userVisibleOutputs.length); i++) {
    Object.defineProperty(interfaceContext, -i, {
      get: () => userVisibleOutputs[userVisibleOutputs.length - i],
      enumerable: false
    });
  }

  // Add lazy-evaluated @pipeline.all.tries accessor
  // This accumulates ALL retry attempts across ALL contexts
  Object.defineProperty(interfaceContext, 'all', {
    get: () => {
      if (!events) {
        return { tries: [] };
      }
      
      // Collect all retry attempts from all contexts
      const allTries: string[][] = [];
      const contextTries = new Map<string, string[]>();
      
      // Process events to build retry history
      for (const event of events) {
        if (event.type === 'STAGE_SUCCESS' && event.contextId) {
          // Track successful outputs within retry contexts
          if (!contextTries.has(event.contextId)) {
            contextTries.set(event.contextId, []);
          }
          contextTries.get(event.contextId)!.push(event.output);
        } else if (event.type === 'STAGE_RETRY_REQUEST') {
          // When a retry is requested, save the current context's attempts
          if (event.parentContextId && contextTries.has(event.parentContextId)) {
            allTries.push([...contextTries.get(event.parentContextId)!]);
          }
        }
      }
      
      // Add any remaining context tries
      for (const tries of contextTries.values()) {
        if (tries.length > 0) {
          allTries.push(tries);
        }
      }
      
      return {
        tries: allTries
      };
    },
    enumerable: false,
    configurable: true
  });

  return interfaceContext as InterfacePipelineContext;
}

/**
 * Create pipeline context variable wrapper
 */
function createPipelineContextVariable(name: string, context: any, source: VariableSource): any {
  // Use the proper factory to create an ObjectVariable
  // This ensures it has the same structure as regular object variables
  return createObjectVariable(
    name,
    context,
    false, // isComplex - pipeline context is not complex (no embedded directives)
    source,
    {
      isPipelineContext: true,
      isSystem: true
    }
  );
}