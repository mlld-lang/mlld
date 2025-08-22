import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';

// Import pipeline implementation
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { createStageEnvironment } from './context-builder';
import { MlldCommandExecutionError } from '@core/errors';
import { preprocessPipeline, type LogicalStage, type PreprocessedPipeline } from './preprocessor';
import { USE_UNIVERSAL_CONTEXT } from '@core/feature-flags';

/**
 * Evaluator interface for dependency injection
 * This allows us to inject the evaluate function without circular dependencies
 */
export interface IEvaluator {
  evaluate(node: any, env: Environment, context?: any): Promise<{ value: any; env: Environment }>;
  getContext?(): any;  // Optional method to get current context
}

/**
 * Pipeline Executor - Handles actual execution using state machine
 */
export class PipelineExecutor {
  private stateMachine: PipelineStateMachine;
  private env: Environment;
  private format?: string;
  private pipeline: PipelineCommand[];  // Keep original for compatibility
  private preprocessed: PreprocessedPipeline;  // NEW
  private logicalStages: LogicalStage[];  // NEW
  private isRetryable: boolean;
  private sourceFunction?: () => Promise<string>; // Store source function for retries
  private sourceExecutedOnce: boolean = false; // Track if source has been executed once
  private initialInput: string = ''; // Store initial input for synthetic source
  private allRetryHistory: Map<string, string[]> = new Map();
  private evaluator?: IEvaluator;  // NEW: Optional evaluator for dependency injection

  constructor(
    pipeline: PipelineCommand[],
    env: Environment,
    format?: string,
    isRetryable: boolean = false,
    sourceFunction?: () => Promise<string>,
    evaluator?: IEvaluator  // NEW: Optional injection point
  ) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Constructor (with preprocessing):', {
        originalPipelineLength: pipeline.length,
        isRetryable,
        hasSourceFunction: !!sourceFunction
      });
    }
    
    // Preprocess pipeline to extract effects
    this.preprocessed = preprocessPipeline(pipeline, isRetryable, sourceFunction);
    this.logicalStages = this.preprocessed.logicalStages;
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] After preprocessing:', {
        logicalStagesCount: this.logicalStages.length,
        totalBuiltins: this.preprocessed.totalBuiltins,
        hasLeadingBuiltins: this.preprocessed.hasLeadingBuiltins,
        requiresSyntheticSource: this.preprocessed.requiresSyntheticSource
      });
    }
    
    // Use logical stage count for state machine
    this.stateMachine = new PipelineStateMachine(
      this.logicalStages.length,
      isRetryable || this.preprocessed.requiresSyntheticSource
    );
    
    this.pipeline = pipeline;  // Keep original for debugging
    this.env = env;
    this.format = format;
    this.isRetryable = isRetryable;
    this.sourceFunction = sourceFunction;
    this.evaluator = evaluator;  // Store the injected evaluator
  }

  /**
   * Execute the pipeline
   */
  async execute(initialInput: string): Promise<string> {
    // Save original context to restore after pipeline
    const originalContext = this.env.getUniversalContext();
    
    // Store initial input for synthetic source stage
    this.initialInput = initialInput;
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Starting execution:', {
        logicalStages: this.logicalStages.map(s => ({
          stage: s.command.rawIdentifier,
          effects: s.effects.map(e => (e as any).command || e.rawIdentifier || 'unknown')
        }))
      });
    }
    
    // Update UniversalContext when pipeline starts
    this.env.updateUniversalContext({
      isPipeline: true,
      stage: 0,
      input: initialInput
    });
    
    // Start the pipeline
    let nextStep = this.stateMachine.transition({ type: 'START', input: initialInput });
    let iteration = 0;

    // Process steps until complete
    while (nextStep.type === 'EXECUTE_STAGE') {
      iteration++;
      
      const logicalStage = this.logicalStages[nextStep.stage];
      
      // Build tries array from events
      const events = this.stateMachine.getEvents();
      const tries = [];
      let currentAttempt = 1;
      
      for (const event of events) {
        if (event.type === 'STAGE_SUCCESS') {
          tries.push({
            attempt: currentAttempt,
            result: 'success' as const,
            output: event.output
          });
          currentAttempt++;
        } else if (event.type === 'STAGE_RETRY_REQUEST') {
          tries.push({
            attempt: currentAttempt,
            result: 'retry' as const,
            hint: nextStep.context.hint || null
          });
          currentAttempt++;
        }
      }
      
      // Update UniversalContext for this stage
      this.env.updateUniversalContext({
        stage: nextStep.stage,
        input: nextStep.input,
        try: nextStep.context.contextAttempt,
        tries,
        hint: nextStep.context.hint || null,
        lastOutput: nextStep.context.lastOutput || null
      });
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error(`[PipelineExecutor] Executing logical stage ${nextStep.stage}:`, {
          command: logicalStage.command.rawIdentifier,
          effectsCount: logicalStage.effects.length,
          contextAttempt: nextStep.context.contextAttempt,
          input: nextStep.input?.substring(0, 50)
        });
      }
      
      const result = await this.executeLogicalStage(
        logicalStage,
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
    // Restore context when pipeline completes
    try {
      switch (nextStep.type) {
        case 'COMPLETE':
          return nextStep.output;
      
      case 'ERROR':
        throw new MlldCommandExecutionError(
          `Pipeline failed at stage ${nextStep.stage + 1}: ${nextStep.error.message}`,
          undefined,
          {
            command: this.logicalStages[nextStep.stage]?.command.rawIdentifier || 'unknown',
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
    } finally {
      // Restore original context when pipeline completes
      if (originalContext) {
        this.env.updateUniversalContext(originalContext);
      }
    }
  }

  /**
   * Execute a logical stage (command + effects)
   */
  private async executeLogicalStage(
    logicalStage: LogicalStage,
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      // Set up execution environment
      const stageEnv = await createStageEnvironment(
        logicalStage.command, 
        input, 
        context, 
        this.env, 
        this.format,
        this.stateMachine.getEvents(),
        false,  // No more synthetic sources
        this.allRetryHistory
      );
      
      // Execute preceding effects (before stage, with current input)
      for (const effect of logicalStage.effects) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Executing preceding effect:', {
            command: (effect as any).command || effect.rawIdentifier,
            inputLength: input.length
          });
        }
        // Errors in builtins should fail the pipeline for correctness
        await this.executeBuiltinEffect(effect, input, stageEnv);
      }
      
      // Execute the command
      let output: string | any; // Can be retry signal object
      
      if (logicalStage.isImplicitIdentity) {
        // Identity stage - just pass through
        output = input;
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Implicit identity stage, passing through input');
        }
      } else {
        // Normal command execution
        output = await this.executeCommand(logicalStage.command, input, stageEnv);
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage output:', {
          stage: context.stage,
          outputType: typeof output,
          output: typeof output === 'string' ? output.substring(0, 50) : output,
          isRetry: this.isRetrySignal(output),
          hasRetryProp: output && typeof output === 'object' ? output.__retry : undefined
        });
      }
      
      // Check for retry signal (from command, not effects)
      console.error('[DEBUG] About to check isRetrySignal, output:', output, 'type:', typeof output);
      if (this.isRetrySignal(output)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Retry detected at logical stage', context.stage);
        }
        const from = this.parseRetryScope(output);
        const hint = this.extractRetryHint(output);
        
        // Pass hint to state machine
        if (hint !== null) {
          this.stateMachine.setRetryHint(hint);
        }
        
        return { type: 'retry', reason: 'Stage requested retry', from, hint };
      }

      // Empty output terminates pipeline
      if (!output || (typeof output === 'string' && output.trim() === '')) {
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
   * Execute a builtin command as an effect
   */
  private async executeBuiltinEffect(
    effect: PipelineCommand,
    input: string,
    env: Environment
  ): Promise<void> {
    // Create a child environment for the builtin to properly set @input
    const builtinEnv = env.createChild();
    
    // Try to parse input as JSON for field access support
    try {
      const parsed = JSON.parse(input);
      // If it's valid JSON, set @input as an object variable
      const { createObjectVariable } = await import('@core/types/variable');
      const inputVar = createObjectVariable(
        'input',
        parsed,
        false,  // isComplex = false (already evaluated object)
        {
          directive: 'var',
          syntax: 'data',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          isSystem: true,
          isPipelineInput: true
        }
      );
      builtinEnv.setVariable('input', inputVar);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[executeBuiltinEffect] Set @input as object:', parsed);
      }
    } catch {
      // Not JSON or parse failed - set as text variable
      const { createSimpleTextVariable } = await import('@core/types/variable');
      const inputVar = createSimpleTextVariable(
        'input',
        input,
        {
          directive: 'var',
          syntax: 'template',
          hasInterpolation: false,
          isMultiLine: false
        },
        {
          isSystem: true,
          isPipelineInput: true
        }
      );
      builtinEnv.setVariable('input', inputVar);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[executeBuiltinEffect] Set @input as text:', input);
      }
    }
    
    // Use existing executeBuiltinCommand but ignore the return value
    await this.executeBuiltinCommand(effect, input, builtinEnv);
  }

  /**
   * Execute a single stage (DEPRECATED - kept for backwards compatibility)
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
        false,  // No more synthetic sources
        this.allRetryHistory
      );
      
      // Execute the command
      const output = await this.executeCommand(command, input, stageEnv);
      
      // No need to transfer nodes - effects are emitted immediately to the shared handler
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Stage output:', {
          stage: context.stage,
          outputType: typeof output,
          output: typeof output === 'string' ? output.substring(0, 50) : output,
          isRetry: this.isRetrySignal(output),
          hasRetryProp: output && typeof output === 'object' ? output.__retry : undefined
        });
      }
      
      // Check for retry signal
      if (this.isRetrySignal(output)) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Retry detected at stage', context.stage);
        }
        const from = this.parseRetryScope(output);
        const hint = this.extractRetryHint(output);
        
        // Pass hint to state machine
        if (hint !== null) {
          this.stateMachine.setRetryHint(hint);
        }
        
        return { type: 'retry', reason: 'Stage requested retry', from, hint };
      }

      // Empty output terminates pipeline
      if (!output || (typeof output === 'string' && output.trim() === '')) {
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
  ): Promise<string | any> {  // Can return retry signal objects
    // Always use universal path when evaluator is available
    if (this.evaluator) {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[executeCommand] Using UNIVERSAL path');
      }
      return this.executeCommandUniversal(command, input, stageEnv);
    }
    
    // Fallback to legacy if no evaluator (shouldn't happen in practice)
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[executeCommand] Using LEGACY path (no evaluator!)');
    }
    return this.executeCommandLegacy(command, input, stageEnv);
  }
  
  /**
   * Execute command using injected evaluator (universal context path)
   */
  private async executeCommandUniversal(
    command: PipelineCommand,
    input: string,
    stageEnv: Environment
  ): Promise<string | any> {  // Can return retry signal objects
    // Don't try to set @input - stageEnv already has it set by createStageEnvironment
    
    // Handle source commands with sourceNode (from universal context conversion)
    if ((command as any).sourceNode) {
      const sourceNode = (command as any).sourceNode;
      
      // Re-execute the source node
      if (sourceNode.type === 'ExecInvocation') {
        const { evaluateExecInvocation } = await import('../exec-invocation');
        // Pass stageEnv which has the pipeline context already set
        // evaluateExecInvocation takes (node, env, evaluator?) not context
        const result = await evaluateExecInvocation(sourceNode, stageEnv, this.evaluator);
        // Check if it's a retry signal - don't stringify it!
        if (result.value && typeof result.value === 'object' && result.value.__retry === true) {
          return result.value;  // Return retry signal as-is for detection
        }
        return String(result.value);
      } else if (sourceNode.type === 'command') {
        const { interpolate } = await import('../../core/interpreter');
        const { InterpolationContext } = await import('../../core/interpolation-context');
        const command = await interpolate(sourceNode.commandTemplate || sourceNode.nodes || [], stageEnv, InterpolationContext.ShellCommand);
        const result = await stageEnv.executeCommand(command);
        return result;
      } else if (sourceNode.type === 'code') {
        const { evaluateCodeExecution } = await import('../code-execution');
        const result = await evaluateCodeExecution(sourceNode, stageEnv);
        // Check if it's a retry signal - don't stringify it!
        if (result.value && typeof result.value === 'object' && result.value.__retry === true) {
          return result.value;  // Return retry signal as-is for detection
        }
        return String(result.value);
      }
      
      // Fallback - just return input
      return input;
    }
    
    // Handle built-in pipeline commands (show, log, output) and transformers
    if ('type' in command && command.type === 'builtinCommand') {
      return await this.executeBuiltinCommand(command, input, stageEnv);
    }
    
    // First, resolve the command reference to get the actual executable
    const commandVar = await this.resolveCommandReference(command, stageEnv);
    
    if (!commandVar) {
      throw new Error(`Pipeline command ${command.rawIdentifier} not found`);
    }
    
    // Debug: log what we got from resolveCommandReference
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[executeCommandUniversal] Resolved command:', {
        rawIdentifier: command.rawIdentifier,
        commandVarType: typeof commandVar,
        isVariable: commandVar && typeof commandVar === 'object' && 'type' in commandVar,
        variableType: commandVar?.type,
        hasMetadata: !!commandVar?.metadata,
        hasExecutable: !!commandVar?.metadata?.__executable,
        commandVarKeys: commandVar && typeof commandVar === 'object' ? Object.keys(commandVar) : []
      });
    }
    
    // Check if it's an executable variable (function or transformer)
    // Need to check both metadata.__executable AND type === 'executable'
    const isExecutable = (commandVar && commandVar.metadata?.__executable) || 
                         (commandVar && commandVar.type === 'executable');
    
    if (isExecutable) {
      const executable = commandVar.metadata?.__executable || commandVar;
      
      // Process arguments if any
      const args = await this.processArguments(command.args || [], stageEnv);
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[executeCommandUniversal] About to call executeCommandVariable:', {
          hasCommandVar: !!commandVar,
          argsLength: args.length,
          inputLength: input.length,
          inputPreview: input.substring(0, 50)
        });
      }
      
      // For pipeline execution, we need to call executeCommandVariable
      // which handles the proper execution of functions with @input
      const result = await this.executeCommandVariable(commandVar, args, stageEnv, input);
      
      // Check for retry signal BEFORE treating as string
      if (result && typeof result === 'object' && result.__retry === true) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[executeCommandUniversal] Detected retry signal:', {
            hasHint: !!result.hint,
            hint: result.hint
          });
        }
        return result;  // Return retry signal as-is for detection
      }
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[executeCommandUniversal] executeCommandVariable returned:', {
          resultType: typeof result,
          resultLength: result?.length,
          resultPreview: String(result).substring(0, 100)
        });
      }
      
      // The result is already a string from executeCommandVariable
      return result;
    }
    
    // If not executable, try to evaluate it as a variable reference
    // This handles cases where the command is just a variable name
    if (command.identifier) {
      const result = await this.evaluator!.evaluate({
        type: 'VariableReference',
        identifier: command.rawIdentifier
      }, stageEnv);
      return this.normalizeOutput(result.value);
    }
    
    throw new Error(`Pipeline command ${command.rawIdentifier} is not executable`);
  }
  
  /**
   * Legacy execution path (existing implementation)
   */
  private async executeCommandLegacy(
    command: PipelineCommand,
    input: string,
    stageEnv: Environment
  ): Promise<string | any> {  // Can return retry signal objects
    // Legacy synthetic source handling - deprecated with universal context
    if (command.rawIdentifier === 'source') {
      // This should not be reached with universal context
      // Sources are now real pipeline stages
      if (this.sourceFunction) {
        const currentContext = stageEnv.getPipelineContext();
        if (currentContext && this.env) {
          this.env.setPipelineContext(currentContext);
        }
        const fresh = await this.sourceFunction();
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[PipelineExecutor] Legacy source function returned:', fresh);
        }
        return fresh;
      }
      // No source function - return input  
      return this.initialInput;
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
      const output = await this.executeCommandVariable(commandVar, args, stageEnv, input);
      
      // Check for retry signal BEFORE AutoUnwrapManager processes it
      if (output && typeof output === 'object' && output.__retry === true) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[executeCommandLegacy] Detected retry signal:', {
            hasHint: !!output.hint,
            hint: output.hint
          });
        }
        return output;  // Return retry signal as-is
      }
      
      return output;
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
  ): Promise<string | any> {  // Allow retry signal objects through
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
        if (!variable) {
          // Throw error for undefined variables in builtins
          // This ensures pipeline fails on errors rather than silently continuing
          throw new Error(`Variable not found: ${arg.identifier}`);
        }
        const { extractVariableValue } = await import('../../utils/variable-resolution');
        const value = await extractVariableValue(variable, env);
        return typeof value === 'string' ? value : JSON.stringify(value);
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

    // Note: Builtin commands are pass-through stages that emit effects
    // but return input unchanged. They don't affect retry logic.

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
    // Check for direct retry values
    let isRetry = output === 'retry' || 
      (output && typeof output === 'object' && (output.value === 'retry' || output.retry === true || output.__retry === true));
    
    // Also check for stringified JSON retry signal
    if (!isRetry && typeof output === 'string' && output.startsWith('{')) {
      try {
        const parsed = JSON.parse(output);
        if (parsed && typeof parsed === 'object' && (parsed.retry === true || parsed.__retry === true)) {
          isRetry = true;
        }
      } catch {
        // Not valid JSON, ignore
      }
    }
    
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
  
  private extractRetryHint(output: any): any {
    // Check for __retry format with hint
    if (output && typeof output === 'object' && output.__retry === true) {
      return output.hint || null;
    }
    
    // Check for stringified JSON retry signal with hint
    if (typeof output === 'string' && output.startsWith('{')) {
      try {
        const parsed = JSON.parse(output);
        if (parsed && typeof parsed === 'object' && parsed.__retry === true) {
          return parsed.hint || null;
        }
      } catch {
        // Not valid JSON, ignore
      }
    }
    
    return null;
  }

  private normalizeOutput(output: any): string {
    if (typeof output === 'string') return output;
    if (output?.content && output?.filename) return output.content;
    return JSON.stringify(output);
  }
}
