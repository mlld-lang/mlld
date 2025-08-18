/**
 * Universal Pipeline Executor
 * 
 * Simplified pipeline executor that works with UniversalStateMachine.
 * Key differences from current executor:
 * - No special source handling
 * - No complex context building
 * - Clean separation between state machine and execution
 */

import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { UniversalContext } from '@core/universal-context';
import { UniversalStateMachine, type StateEvent, type StageResult } from './universal-state-machine';
import { USE_UNIVERSAL_CONTEXT, DEBUG_UNIVERSAL_CONTEXT } from '@core/feature-flags';
import { logger } from '@core/utils/logger';
import { MlldCommandExecutionError } from '@core/errors';
import { preprocessPipeline, type LogicalStage, type PreprocessedPipeline } from './preprocessor';

/**
 * Universal Pipeline Executor
 */
export class UniversalPipelineExecutor {
  private stateMachine: UniversalStateMachine;
  private env: Environment;
  private pipeline: PipelineCommand[];
  private preprocessed: PreprocessedPipeline;
  private logicalStages: LogicalStage[];
  private format?: string;
  
  constructor(
    pipeline: PipelineCommand[],
    env: Environment,
    format?: string,
    isRetryable: boolean = false,
    sourceFunction?: () => Promise<string>,
    hasSyntheticSource: boolean = false
  ) {
    // Preprocess pipeline to extract effects
    this.preprocessed = preprocessPipeline(pipeline, isRetryable, sourceFunction);
    this.logicalStages = this.preprocessed.logicalStages;
    
    if (DEBUG_UNIVERSAL_CONTEXT) {
      logger.debug('[Universal Executor] After preprocessing:', {
        logicalStagesCount: this.logicalStages.length,
        totalBuiltins: this.preprocessed.totalBuiltins,
        hasLeadingBuiltins: this.preprocessed.hasLeadingBuiltins,
        requiresSyntheticSource: this.preprocessed.requiresSyntheticSource
      });
    }
    
    // Create state machine with logical stage count
    this.stateMachine = new UniversalStateMachine(this.logicalStages.length);
    
    this.pipeline = pipeline;
    this.env = env;
    this.format = format;
  }
  
  /**
   * Execute the pipeline
   */
  async execute(initialInput: string): Promise<string> {
    if (DEBUG_UNIVERSAL_CONTEXT) {
      logger.debug('[Universal Executor] Starting execution:', {
        logicalStages: this.logicalStages.map(s => ({
          stage: s.command.rawIdentifier,
          effects: s.effects.map(e => (e as any).command || e.rawIdentifier || 'unknown')
        }))
      });
    }
    
    // Start the pipeline
    let transition = this.stateMachine.start(initialInput);
    let currentInput = initialInput;
    let iteration = 0;
    
    // Process transitions until complete
    while (transition.type === 'EXECUTE_STAGE') {
      iteration++;
      
      if (iteration > 100) {
        throw new Error('Pipeline exceeded 100 iterations');
      }
      
      const logicalStage = this.logicalStages[transition.stage];
      
      if (DEBUG_UNIVERSAL_CONTEXT) {
        logger.debug(`[Universal Executor] Executing stage ${transition.stage}:`, {
          command: logicalStage.command.rawIdentifier,
          effectsCount: logicalStage.effects.length,
          context: transition.context
        });
      }
      
      // Execute the stage with context
      const result = await this.executeStage(
        logicalStage,
        currentInput,
        transition.context
      );
      
      if (DEBUG_UNIVERSAL_CONTEXT) {
        logger.debug('[Universal Executor] Stage result:', {
          resultType: result.type,
          output: result.type === 'success' ? result.output?.substring(0, 50) : undefined
        });
      }
      
      // Update input for next stage if successful
      if (result.type === 'success') {
        currentInput = result.output;
      }
      
      // Get next transition from state machine
      transition = this.stateMachine.transition(
        { type: 'STAGE_RESULT', result },
        currentInput
      );
    }
    
    // Handle final transition
    switch (transition.type) {
      case 'COMPLETE':
        return transition.output;
      
      case 'ABORT':
        throw new MlldCommandExecutionError(
          `Pipeline aborted: ${transition.reason}`,
          undefined,
          {
            command: 'pipeline',
            exitCode: 1,
            duration: 0,
            workingDirectory: process.cwd()
          }
        );
      
      default:
        throw new Error('Pipeline ended in unexpected state');
    }
  }
  
  /**
   * Execute a single stage (command + effects)
   */
  private async executeStage(
    logicalStage: LogicalStage,
    input: string,
    context: UniversalContext
  ): Promise<StageResult> {
    try {
      // Create child environment with context
      const stageEnv = this.env.createChild(undefined, context);
      
      // Set @input variable
      stageEnv.setVariable('input', {
        type: 'simple-text',
        value: input,
        metadata: {}
      });
      
      // Execute preceding effects (builtins like show/log/output)
      for (const effect of logicalStage.effects) {
        if (DEBUG_UNIVERSAL_CONTEXT) {
          logger.debug('[Universal Executor] Executing effect:', {
            command: (effect as any).command || effect.rawIdentifier
          });
        }
        await this.executeEffect(effect, input, stageEnv);
      }
      
      // Execute the main command
      let output: string;
      
      if (logicalStage.isImplicitIdentity) {
        // Identity stage - just pass through
        output = input;
        if (DEBUG_UNIVERSAL_CONTEXT) {
          logger.debug('[Universal Executor] Identity stage, passing through');
        }
      } else {
        // Execute the command
        output = await this.executeCommand(logicalStage.command, input, stageEnv);
      }
      
      // Check for retry signal
      if (this.isRetrySignal(output)) {
        return { type: 'retry', reason: 'Stage requested retry' };
      }
      
      // Empty output terminates pipeline
      if (!output || output.trim() === '') {
        return { type: 'success', output: '' };
      }
      
      return { type: 'success', output: this.normalizeOutput(output) };
      
    } catch (error) {
      return { type: 'error', error: error as Error };
    }
  }
  
  /**
   * Execute a command in the stage environment
   */
  private async executeCommand(
    command: PipelineCommand,
    input: string,
    env: Environment
  ): Promise<string> {
    // Import the actual command execution logic
    const { executeCommand } = await import('./command-executor');
    return executeCommand(command, input, env, this.format);
  }
  
  /**
   * Execute an effect (builtin like show/log/output)
   */
  private async executeEffect(
    effect: PipelineCommand,
    input: string,
    env: Environment
  ): Promise<void> {
    // Import the actual effect execution logic
    const { executeBuiltinEffect } = await import('./effect-executor');
    await executeBuiltinEffect(effect, input, env);
  }
  
  /**
   * Check if output is a retry signal
   */
  private isRetrySignal(output: any): boolean {
    if (typeof output === 'string') {
      return output === 'retry' || 
             output.startsWith('retry:') || 
             output.startsWith('RETRY');
    }
    
    if (output && typeof output === 'object') {
      return output.kind === 'RETRY' || 
             output.signal === 'retry' || 
             output.retry === true;
    }
    
    return false;
  }
  
  /**
   * Normalize output to string
   */
  private normalizeOutput(output: any): string {
    if (typeof output === 'string') {
      return output;
    }
    
    if (output === null || output === undefined) {
      return '';
    }
    
    // Convert objects to JSON
    if (typeof output === 'object') {
      try {
        return JSON.stringify(output, null, 2);
      } catch {
        return String(output);
      }
    }
    
    return String(output);
  }
}

/**
 * Create the appropriate executor based on feature flag
 */
export function createPipelineExecutor(
  pipeline: PipelineCommand[],
  env: Environment,
  format?: string,
  isRetryable?: boolean,
  sourceFunction?: () => Promise<string>,
  hasSyntheticSource?: boolean
): any {
  if (USE_UNIVERSAL_CONTEXT) {
    return new UniversalPipelineExecutor(
      pipeline,
      env,
      format,
      isRetryable,
      sourceFunction,
      hasSyntheticSource
    );
  } else {
    // Use the current executor
    const { PipelineExecutor } = require('./executor');
    return new PipelineExecutor(
      pipeline,
      env,
      format,
      isRetryable,
      sourceFunction,
      hasSyntheticSource
    );
  }
}