import type { Environment } from '../../env/Environment';
import type { PipelineCommand, VariableSource } from '@core/types';
import type { StageContext } from './state-machine';
import { createPipelineInputVariable, createSimpleTextVariable } from '@core/types/variable';
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
  format?: string
): Promise<Environment> {
  // Set pipeline context in main environment
  env.setPipelineContext({
    stage: context.stage,
    totalStages: context.totalStages,
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
  setPipelineVariable(stageEnv, context);
  
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
function setPipelineVariable(env: Environment, context: StageContext): void {
  const interfaceContext = createInterfacePipelineContext(context);
  
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
function createInterfacePipelineContext(context: StageContext): InterfacePipelineContext {
  const interfaceContext: any = {
    // Stage-specific data
    try: context.attempt,
    tries: context.history,
    stage: context.stage,
    
    // Pipeline data access
    length: context.previousOutputs.length,
    
    // Array-style access to outputs
    ...context.outputs
  };

  // Add negative indexing support
  const outputs = context.previousOutputs;
  Object.defineProperty(interfaceContext, -1, {
    get: () => outputs[outputs.length - 1],
    enumerable: false
  });

  Object.defineProperty(interfaceContext, -2, {
    get: () => outputs[outputs.length - 2],
    enumerable: false
  });

  // Add more negative indices as needed
  for (let i = 3; i <= Math.max(10, outputs.length); i++) {
    Object.defineProperty(interfaceContext, -i, {
      get: () => outputs[outputs.length - i],
      enumerable: false
    });
  }

  return interfaceContext as InterfacePipelineContext;
}

/**
 * Create pipeline context variable wrapper
 */
function createPipelineContextVariable(name: string, context: any, source: VariableSource): any {
  return {
    type: 'object',
    name,
    value: context,
    metadata: {
      isPipelineContext: true,
      source,
      isSystem: true
    }
  };
}