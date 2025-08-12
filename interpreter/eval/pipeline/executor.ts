import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';

// Feature flag for simplified retry implementation
const USE_SIMPLIFIED_RETRY = process.env.MLLD_USE_SIMPLIFIED_RETRY === 'true';

// Import appropriate implementation based on feature flag
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { SimplifiedPipelineStateMachine } from './state-machine-simplified';
import { createStageEnvironment } from './context-builder';
import { createSimplifiedStageEnvironment } from './context-builder-simplified';
import { MlldCommandExecutionError } from '@core/errors';

/**
 * Pipeline Executor - Handles actual execution using state machine
 */
export class PipelineExecutor {
  private stateMachine: PipelineStateMachine | SimplifiedPipelineStateMachine;
  private env: Environment;
  private format?: string;
  private pipeline: PipelineCommand[];
  private isRetryable: boolean;
  private sourceFunction?: () => Promise<string>; // Store source function for retries
  private hasSyntheticSource: boolean;
  private sourceExecutedOnce: boolean = false; // Track if source has been executed once
  private initialInput: string = ''; // Store initial input for synthetic source
  private allRetryHistory: Map<string, string[]> = new Map(); // For simplified implementation

  constructor(
    pipeline: PipelineCommand[],
    env: Environment,
    format?: string,
    isRetryable: boolean = false,
    sourceFunction?: () => Promise<string>,
    hasSyntheticSource: boolean = false
  ) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Constructor:', {
        useSimplified: USE_SIMPLIFIED_RETRY,
        pipelineLength: pipeline.length,
        pipelineStages: pipeline.map(p => p.rawIdentifier || 'unknown'),
        isRetryable,
        hasSourceFunction: !!sourceFunction,
        hasSyntheticSource
      });
    }
    
    // Use appropriate state machine based on feature flag
    this.stateMachine = USE_SIMPLIFIED_RETRY 
      ? new SimplifiedPipelineStateMachine(pipeline.length, isRetryable)
      : new PipelineStateMachine(pipeline.length, isRetryable);
    this.pipeline = pipeline;
    this.env = env;
    this.format = format;
    this.isRetryable = isRetryable;
    this.sourceFunction = sourceFunction;
    this.hasSyntheticSource = hasSyntheticSource;
  }

  /**
   * Execute the pipeline
   */
  async execute(initialInput: string): Promise<string> {
    // Store initial input for synthetic source stage
    this.initialInput = initialInput;
    
    console.log('🚀 PIPELINE START:', {
      stages: this.pipeline.map(p => p.rawIdentifier),
      hasSyntheticSource: this.hasSyntheticSource,
      isRetryable: this.isRetryable
    });
    
    // Start the pipeline
    let nextStep = this.stateMachine.transition({ type: 'START', input: initialInput });
    let iteration = 0;

    // Process steps until complete
    while (nextStep.type === 'EXECUTE_STAGE') {
      iteration++;
      
      console.log(`\n📍 ITERATION ${iteration}:`, {
        stage: nextStep.stage,
        stageId: this.pipeline[nextStep.stage]?.rawIdentifier,
        contextAttempt: nextStep.context.contextAttempt,
        attempt: nextStep.context.attempt,
        contextId: nextStep.context.contextId
      });
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Execute stage:', {
          stage: nextStep.stage,
          contextId: nextStep.context.contextId,
          contextAttempt: nextStep.context.contextAttempt,
          inputLength: nextStep.input?.length,
          commandId: this.pipeline[nextStep.stage]?.rawIdentifier
        });
      }
      
      const command = this.pipeline[nextStep.stage];
      const result = await this.executeStage(
        command,
        nextStep.input,
        nextStep.context
      );
      
      console.log('📤 STAGE RESULT:', {
        resultType: result.type,
        isRetry: result.type === 'retry',
        output: result.type === 'success' ? result.output?.substring(0, 50) : undefined
      });
      
      // Let state machine decide next step
      nextStep = this.stateMachine.transition({ 
        type: 'STAGE_RESULT', 
        result 
      });
      
      // Update retry history for simplified implementation
      if (USE_SIMPLIFIED_RETRY && this.stateMachine instanceof SimplifiedPipelineStateMachine) {
        this.allRetryHistory = this.stateMachine.getAllRetryHistory();
      }
      
      console.log('📥 NEXT STEP:', {
        type: nextStep.type,
        nextStage: nextStep.type === 'EXECUTE_STAGE' ? nextStep.stage : undefined,
        nextStageId: nextStep.type === 'EXECUTE_STAGE' ? this.pipeline[nextStep.stage]?.rawIdentifier : undefined
      });
      
      // Safety check for infinite loops
      if (iteration > 100) {
        throw new Error('Pipeline exceeded 100 iterations');
      }
    }
    
    // Handle final state
    switch (nextStep.type) {
      case 'COMPLETE':
        return nextStep.output;
      
      case 'ERROR':
        throw new MlldCommandExecutionError(
          `Pipeline failed at stage ${nextStep.stage + 1}: ${nextStep.error.message}`,
          undefined,
          {
            command: this.pipeline[nextStep.stage]?.rawIdentifier || 'unknown',
            exitCode: 1,
            duration: 0,
            workingDirectory: process.cwd()
          }
        );
      
      case 'ABORT':
        throw new MlldCommandExecutionError(
          `Pipeline aborted: ${nextStep.reason}`,
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
   * Execute a single stage
   */
  private async executeStage(
    command: PipelineCommand,
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      // Set up execution environment using appropriate context builder
      const stageEnv = USE_SIMPLIFIED_RETRY
        ? await createSimplifiedStageEnvironment(
            command, 
            input, 
            context, 
            this.env, 
            this.format,
            this.stateMachine.getEvents(),
            this.hasSyntheticSource,
            this.allRetryHistory  // Pass retry history for simplified implementation
          )
        : await createStageEnvironment(
            command, 
            input, 
            context, 
            this.env, 
            this.format,
            this.stateMachine.getEvents(),
            this.hasSyntheticSource
          );
      
      // Execute the command
      const output = await this.executeCommand(command, input, stageEnv);
      
      // DEBUG: What did the command return?
      console.log('🎯 STAGE OUTPUT:', {
        stage: context.stage,
        stageId: command.rawIdentifier,
        output,
        isRetry: this.isRetrySignal(output),
        outputType: typeof output,
        outputValue: output
      });
      
      // Check for retry signal
      if (this.isRetrySignal(output)) {
        console.log('🔄 RETRY DETECTED:', {
          stage: context.stage,
          output,
          willRetryFrom: context.stage === 0 ? 0 : context.stage - 1
        });
        const from = this.parseRetryScope(output);
        return { type: 'retry', reason: 'Stage requested retry', from };
      }

      // Empty output terminates pipeline
      if (!output || output.trim() === '') {
        return { type: 'success', output: '' };
      }

      return { type: 'success', output: this.normalizeOutput(output) };

    } catch (error) {
      return { type: 'error', error: error as Error };
    } finally {
      this.env.clearPipelineContext();
    }
  }

  /**
   * Execute a pipeline command
   */
  private async executeCommand(
    command: PipelineCommand,
    input: string,
    stageEnv: Environment
  ): Promise<string> {
    // Special handling for synthetic __source__ stage
    if (command.rawIdentifier === '__source__') {
      const firstTime = !this.sourceExecutedOnce;
      this.sourceExecutedOnce = true;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Executing __source__ stage:', {
          firstTime,
          hasSourceFunction: !!this.sourceFunction,
          isRetryable: this.isRetryable
        });
      }
      
      if (firstTime) {
        // First execution - return the already-computed initial input
        return this.initialInput;
      }
      
      // Retry execution - need to call source function
      if (!this.sourceFunction) {
        throw new Error('Cannot retry stage 0: Input is not a function and cannot be retried');
      }
      
      // Re-execute the source function to get fresh input
      const fresh = await this.sourceFunction();
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Source function returned fresh input:', fresh);
      }
      return fresh;
    }
    
    // Resolve the command reference
    const commandVar = await this.resolveCommandReference(command, stageEnv);
    
    if (!commandVar) {
      throw new Error(`Pipeline command ${command.rawIdentifier} not found`);
    }

    // Get arguments and validate them
    let args = await this.processArguments(command.args || [], stageEnv);

    // Smart parameter binding for pipeline functions
    if (args.length === 0) {
      args = await this.bindParametersAutomatically(commandVar, input);
    }

    // Execute with metadata preservation
    const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
    
    const result = await AutoUnwrapManager.executeWithPreservation(async () => {
      return await this.executeCommandVariable(commandVar, args, stageEnv, input);
    });

    return result;
  }

  /**
   * Process and validate command arguments
   */
  private async processArguments(args: any[], env: Environment): Promise<any[]> {
    const evaluatedArgs = [];

    for (const arg of args) {
      // Validate arguments - prevent explicit @input passing
      if (arg && typeof arg === 'object') {
        const isInputVariable = 
          (arg.type === 'variable' && arg.name === 'input') ||
          (arg.type === 'VariableReference' && arg.identifier === 'input');
        
        if (isInputVariable) {
          throw new Error(
            '@input is automatically available in pipelines - you don\'t need to pass it explicitly.'
          );
        }
      }

      // Evaluate the argument
      if (typeof arg === 'string') {
        evaluatedArgs.push({ type: 'Text', content: arg });
      } else if (typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
        // Handle primitive values (numbers, booleans, null)
        evaluatedArgs.push({ type: 'Text', content: String(arg) });
      } else if (arg && typeof arg === 'object') {
        const evaluatedArg = await this.evaluateArgumentNode(arg, env);
        evaluatedArgs.push(evaluatedArg);
      }
    }

    return evaluatedArgs;
  }

  /**
   * Evaluate a single argument node
   */
  private async evaluateArgumentNode(arg: any, env: Environment): Promise<any> {
    if (arg.type === 'VariableReference') {
      const variable = env.getVariable(arg.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${arg.identifier}`);
      }

      const { resolveVariable, ResolutionContext } = await import('../../utils/variable-resolution');
      let value = await resolveVariable(variable, env, ResolutionContext.PipelineInput);

      // Apply field access if present
      if (arg.fields && arg.fields.length > 0) {
        const { accessFields } = await import('../../utils/field-access');
        const fieldResult = await accessFields(value, arg.fields, { preserveContext: false });
        value = fieldResult;
      }

      return {
        type: 'Text',
        content: typeof value === 'object' ? JSON.stringify(value) : String(value)
      };
    }

    // For other node types, interpolate
    const { interpolate } = await import('../../core/interpreter');
    const value = await interpolate([arg], env);
    return { type: 'Text', content: value };
  }

  /**
   * Smart parameter binding for functions without explicit arguments
   */
  private async bindParametersAutomatically(commandVar: any, input: string): Promise<any[]> {
    let paramNames: string[] | undefined;
    
    if (commandVar && commandVar.type === 'executable' && commandVar.value) {
      paramNames = commandVar.value.paramNames;
    } else if (commandVar && commandVar.paramNames) {
      paramNames = commandVar.paramNames;
    }

    if (!paramNames || paramNames.length === 0) {
      return [];
    }

    // Auto-unwrap LoadContentResult objects
    const { AutoUnwrapManager } = await import('../auto-unwrap-manager');
    const unwrappedOutput = AutoUnwrapManager.unwrap(input);

    // Single parameter - pass input directly
    if (paramNames.length === 1) {
      return [{ type: 'Text', content: unwrappedOutput }];
    }

    // Multiple parameters - try smart JSON destructuring
    try {
      const parsed = JSON.parse(unwrappedOutput);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return paramNames.map(name => ({
          type: 'Text',
          content: parsed[name] !== undefined 
            ? (typeof parsed[name] === 'string' ? parsed[name] : JSON.stringify(parsed[name]))
            : ''
        }));
      }
    } catch {
      // Not JSON, fall through
    }

    // Not an object or not JSON, pass as first parameter
    return [{ type: 'Text', content: unwrappedOutput }];
  }

  /**
   * Execute a command variable with arguments
   */
  private async executeCommandVariable(
    commandVar: any,
    args: any[],
    env: Environment,
    stdinInput?: string
  ): Promise<string> {
    const { executeCommandVariable } = await import('./command-execution');
    return await executeCommandVariable(commandVar, args, env, stdinInput);
  }

  /**
   * Resolve a command reference to an executable variable
   */
  private async resolveCommandReference(
    command: PipelineCommand,
    env: Environment
  ): Promise<any> {
    const { resolveCommandReference } = await import('./command-execution');
    return await resolveCommandReference(command, env);
  }

  private isRetrySignal(output: any): boolean {
    const isRetry = output === 'retry' || 
      (output && typeof output === 'object' && output.value === 'retry');
    
    console.log('🔍 RETRY CHECK:', {
      output,
      outputType: typeof output,
      isString: typeof output === 'string',
      equalsRetry: output === 'retry',
      hasValueProperty: output && typeof output === 'object' && 'value' in output,
      valueEqualsRetry: output && typeof output === 'object' && output.value === 'retry',
      result: isRetry
    });
    
    return isRetry;
  }

  private parseRetryScope(output: any): number | undefined {
    if (output && typeof output === 'object' && typeof output.from === 'number') {
      return output.from;
    }
    return undefined;
  }

  private normalizeOutput(output: any): string {
    if (typeof output === 'string') return output;
    if (output?.content && output?.filename) return output.content;
    return JSON.stringify(output);
  }
}
