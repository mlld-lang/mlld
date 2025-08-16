import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';

// Import pipeline implementation
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { createStageEnvironment } from './context-builder';
import { MlldCommandExecutionError } from '@core/errors';

/**
 * Pipeline Executor - Handles actual execution using state machine
 */
export class PipelineExecutor {
  private stateMachine: PipelineStateMachine;
  private env: Environment;
  private format?: string;
  private pipeline: PipelineCommand[];
  private isRetryable: boolean;
  private sourceFunction?: () => Promise<string>; // Store source function for retries
  private hasSyntheticSource: boolean;
  private sourceExecutedOnce: boolean = false; // Track if source has been executed once
  private initialInput: string = ''; // Store initial input for synthetic source
  private allRetryHistory: Map<string, string[]> = new Map();

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
        pipelineLength: pipeline.length,
        pipelineStages: pipeline.map(p => p.rawIdentifier || 'unknown'),
        isRetryable,
        hasSourceFunction: !!sourceFunction,
        hasSyntheticSource
      });
    }
    
    // Use simplified state machine
    this.stateMachine = new PipelineStateMachine(pipeline.length, isRetryable);
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
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Pipeline start:', {
        stages: this.pipeline.map(p => p.rawIdentifier),
        hasSyntheticSource: this.hasSyntheticSource,
        isRetryable: this.isRetryable
      });
    }
    
    // Start the pipeline
    let nextStep = this.stateMachine.transition({ type: 'START', input: initialInput });
    let iteration = 0;

    // Process steps until complete
    while (nextStep.type === 'EXECUTE_STAGE') {
      iteration++;
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[PipelineExecutor] Iteration ${iteration}:`, {
          stage: nextStep.stage,
          stageId: this.pipeline[nextStep.stage]?.rawIdentifier,
          contextAttempt: nextStep.context.contextAttempt
        });
      }
      
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
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage result:', {
          resultType: result.type,
          isRetry: result.type === 'retry'
        });
      }
      
      // Let state machine decide next step
      nextStep = this.stateMachine.transition({ 
        type: 'STAGE_RESULT', 
        result 
      });
      
      // Update retry history
      this.allRetryHistory = this.stateMachine.getAllRetryHistory();
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Next step:', {
          type: nextStep.type,
          nextStage: nextStep.type === 'EXECUTE_STAGE' ? nextStep.stage : undefined
        });
      }
      
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
      // Set up execution environment
      const stageEnv = await createStageEnvironment(
        command, 
        input, 
        context, 
        this.env, 
        this.format,
        this.stateMachine.getEvents(),
        this.hasSyntheticSource,
        this.allRetryHistory
      );
      
      // Execute the command
      const output = await this.executeCommand(command, input, stageEnv);
      
      // No need to transfer nodes - effects are emitted immediately to the shared handler
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage output:', {
          stage: context.stage,
          output: typeof output === 'string' ? output.substring(0, 50) : output,
          isRetry: this.isRetrySignal(output)
        });
      }
      
      // Check for retry signal
      if (this.isRetrySignal(output)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Retry detected at stage', context.stage);
        }
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
    
    // Handle built-in pipeline commands (show, log, output)
    if ('type' in command && command.type === 'builtinCommand') {
      return await this.executeBuiltinCommand(command, input, stageEnv);
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

      // Special handling for pipeline context - preserve as object
      // Check if this is the pipeline context or a field access on it
      const isPipelineContext = (arg.identifier === 'pipeline' || arg.identifier === 'p') 
        && variable.metadata?.isPipelineContext;
      
      if (isPipelineContext && typeof value === 'object') {
        // Return the raw object for pipeline context
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Returning raw pipeline context');
        }
        return value;
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
   * Execute a built-in pipeline command (show, log, output)
   * These are pass-through commands that perform side effects but return input unchanged
   */
  private async executeBuiltinCommand(
    command: any, // PipelineBuiltinCommand
    input: string,
    env: Environment
  ): Promise<string> {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Executing builtin command:', {
        command: command.command,
        hasArgs: !!command.args,
        hasTarget: !!command.target
      });
    }

    // Resolve content for show/log commands
    const resolveContent = async (arg: any): Promise<string> => {
      // If no argument, use input
      if (!arg) return input;

      // Handle @input reference
      if (arg.type === 'input') return input;
      
      // Handle @input.field access
      if (arg.type === 'inputField') {
        try {
          const parsed = JSON.parse(input);
          let value = parsed;
          for (const field of arg.fields) {
            if (field.type === 'field' && typeof value === 'object' && value !== null) {
              value = value[field.value];
            } else if (field.type === 'arrayIndex' && Array.isArray(value)) {
              value = value[field.value];
            }
          }
          return typeof value === 'string' ? value : JSON.stringify(value);
        } catch {
          return input; // Fall back to raw input if not JSON
        }
      }

      // Handle variables and templates
      if (arg.type === 'VariableReference') {
        const variable = env.getVariable(arg.identifier);
        if (variable) {
          const { extractVariableValue } = await import('../../utils/variable-resolution');
          const value = await extractVariableValue(variable, env);
          return typeof value === 'string' ? value : JSON.stringify(value);
        }
        return `@${arg.identifier}`;
      }

      // Handle string literals
      if (typeof arg === 'string') return arg;
      
      // Handle template structures (from parsed string literals)
      if (arg && typeof arg === 'object' && arg.content && arg.wrapperType) {
        const { interpolate } = await import('../../core/interpreter');
        return await interpolate(arg.content, env);
      }
      
      // Handle other content
      const { interpolate } = await import('../../core/interpreter');
      return await interpolate([arg], env);
    };

    // Mark this stage as non-retryable in pipeline context
    const pipelineContext = env.getPipelineContext();
    if (pipelineContext) {
      env.setPipelineContext({
        ...pipelineContext,
        isPassThrough: true,  // Mark as pass-through
        nonRetryable: true    // Mark as non-retryable
      });
    }

    // Execute the builtin command based on type
    switch (command.command) {
      case 'show': {
        const content = command.args && command.args.length > 0 
          ? await resolveContent(command.args[0])
          : input;
        // Emit as 'both' effect (stdout + document)
        // Add newline to match behavior of regular /show directive
        env.emitEffect('both', content + '\n');
        return input; // Pass through unchanged
      }

      case 'log': {
        const content = command.args && command.args.length > 0
          ? await resolveContent(command.args[0])
          : input;
        // Emit as 'stderr' effect
        // Add newline only if content doesn't already end with one
        const outputContent = content.endsWith('\n') ? content : content + '\n';
        env.emitEffect('stderr', outputContent);
        return input; // Pass through unchanged
      }

      case 'output': {
        const target = command.target;
        const outputContent = input.endsWith('\n') ? input : input + '\n';
        if (!target) {
          // Default to stdout
          env.emitEffect('stdout', outputContent);
        } else if (target.type === 'stream') {
          if (target.stream === 'stderr') {
            env.emitEffect('stderr', outputContent);
          } else {
            env.emitEffect('stdout', outputContent);
          }
        } else if (target.type === 'file') {
          // Write to file
          const path = target.path;
          // Use file system service to write file
          const fs = await import('fs/promises');
          await fs.writeFile(path, input, 'utf-8');
          // Also emit a file effect for tracking
          env.emitEffect('file', input, { path });
        }
        return input; // Pass through unchanged
      }

      default:
        throw new Error(`Unknown builtin command: ${command.command}`);
    }
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
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Retry check:', {
        output,
        result: isRetry
      });
    }
    
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
