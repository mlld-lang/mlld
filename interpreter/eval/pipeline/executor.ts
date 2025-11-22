import type { Environment } from '../../env/Environment';
import type { PipelineCommand, PipelineStage, PipelineStageEntry, InlineCommandStage, InlineValueStage } from '@core/types';
import type { ExecInvocation, CommandReference } from '@core/types/primitives';
import type { OperationContext, PipelineContextSnapshot } from '../../env/ContextManager';
import type { StructuredValue } from '../../utils/structured-value';
import type { SecurityDescriptor, DataLabel } from '@core/types/security';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';

// Import pipeline implementation
import { PipelineStateMachine, type StageContext, type StageResult } from './state-machine';
import { createStageEnvironment } from './context-builder';
import { GuardError } from '@core/errors/GuardError';
import { MlldCommandExecutionError } from '@core/errors';
import { runBuiltinEffect, isBuiltinEffect } from './builtin-effects';
import { RateLimitRetry, isRateLimitError } from './rate-limit-retry';
import { logger } from '@core/utils/logger';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import {
  asText,
  asData,
  isStructuredValue,
  wrapStructured,
  extractSecurityDescriptor,
  applySecurityDescriptorToStructuredValue,
  type StructuredValueContext
} from '../../utils/structured-value';
import { buildPipelineStructuredValue } from '../../utils/pipeline-input';
import { isPipelineInput } from '@core/types/variable/TypeGuards';
import { ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';
import { wrapLoadContentValue } from '../../utils/load-content-structured';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';
import { inheritExpressionProvenance, setExpressionProvenance } from '../../utils/expression-provenance';
import type { CommandExecutionHookOptions } from './command-execution';
import { InterpolationContext } from '../../core/interpolation-context';

interface StageExecutionResult {
  result: StructuredValue | string | { value: 'retry'; hint?: any; from?: number };
  labelDescriptor?: SecurityDescriptor;
}

export interface ExecuteOptions {
  returnStructured?: boolean;
}

/**
 * Pipeline Executor - Handles actual execution using state machine
 */
/**
 * Pipeline Executor
 * WHY: Drive stage execution using the state machine and construct proper stage environments.
 * CONTEXT: Re-runs inline effects per retry; empty output is treated as early termination.
 */
export class PipelineExecutor {
  private stateMachine: PipelineStateMachine;
  private env: Environment;
  private format?: string;
  private pipeline: PipelineStage[];
  private isRetryable: boolean;
  private sourceFunction?: () => Promise<string | StructuredValue>; // Store source function for retries
  private hasSyntheticSource: boolean;
  private parallelCap?: number;
  private delayMs?: number;
  private sourceExecutedOnce: boolean = false; // Track if source has been executed once
  private initialInputText: string = ''; // Store initial input for synthetic source
  private allRetryHistory: Map<string, string[]> = new Map();
  private rateLimiter = new RateLimitRetry();
  private structuredOutputs: Map<number, StructuredValue> = new Map();
  private initialOutput?: StructuredValue;
  private finalOutput?: StructuredValue;
  private lastStageIndex: number = -1;
  private readonly debugStructured = process.env.MLLD_DEBUG_STRUCTURED === 'true';
  private stageHookNodeCounter = 0;

  constructor(
    pipeline: PipelineStage[],
    env: Environment,
    format?: string,
    isRetryable: boolean = false,
    sourceFunction?: () => Promise<string | StructuredValue>,
    hasSyntheticSource: boolean = false,
    parallelCap?: number,
    delayMs?: number
  ) {
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Constructor:', {
        pipelineLength: pipeline.length,
        pipelineStages: pipeline.map(p => Array.isArray(p) ? '[parallel]' : p.rawIdentifier || 'unknown'),
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
    this.parallelCap = parallelCap;
    this.delayMs = delayMs;
  }

  /**
   * Execute the pipeline
   */
  /**
   * Execute the pipeline until completion or error.
   * WHY: Convert state-machine steps into actual command execution and effect emission.
   */
  async execute(initialInput: string | StructuredValue): Promise<string>;
  async execute(initialInput: string | StructuredValue, options: { returnStructured: true }): Promise<StructuredValue>;
  async execute(initialInput: string | StructuredValue, options?: ExecuteOptions): Promise<string | StructuredValue> {
    this.env.resetPipelineGuardHistory();
    const initialWrapper = isStructuredValue(initialInput)
      ? cloneStructuredValue(initialInput)
      : wrapStructured(initialInput, 'text', typeof initialInput === 'string' ? initialInput : safeJSONStringify(initialInput));
    this.applySourceDescriptor(initialWrapper, initialInput);

    // Store initial input for synthetic source stage
    this.initialInputText = initialWrapper.text;
    this.structuredOutputs.clear();
    this.initialOutput = initialWrapper;
    this.finalOutput = this.initialOutput;
    this.lastStageIndex = -1;
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[PipelineExecutor] Pipeline start:', {
        stages: this.pipeline.map(p => Array.isArray(p) ? '[parallel]' : p.rawIdentifier),
        hasSyntheticSource: this.hasSyntheticSource,
        isRetryable: this.isRetryable
      });
    }
    
    // Start the pipeline
    let nextStep = this.stateMachine.transition({ type: 'START', input: this.initialInputText });
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
      
      const stageEntry = this.pipeline[nextStep.stage];
      const result = Array.isArray(stageEntry)
        ? await this.executeParallelStage(nextStep.stage, stageEntry, nextStep.input, nextStep.context)
        : await this.executeSingleStage(nextStep.stage, stageEntry, nextStep.input, nextStep.context);
      
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
        if (options?.returnStructured) {
          return this.getFinalOutput();
        }
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
  /**
   * Execute a single pipeline stage with the constructed stage environment.
   * GOTCHA: Inline effects are run after successful stage execution and re-run on retries.
   */
  private async executeSingleStage(
    stageIndex: number,
    command: PipelineStageEntry,
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    let stageEnv: Environment | undefined;
    let ctxManager: ReturnType<Environment['getContextManager']> | undefined;
    let pipelineSnapshot: PipelineContextSnapshot | undefined;
    let stageDescriptor: SecurityDescriptor | undefined;

    try {
      const structuredInput = this.getStageOutput(stageIndex - 1, input);
      this.logStructuredStage('input', command.rawIdentifier, stageIndex, structuredInput);
      // Set up execution environment for a single command stage
      stageEnv = await createStageEnvironment(
        command,
        input,
        structuredInput,
        context,
        this.env,
        this.format,
        this.stateMachine.getEvents(),
        this.hasSyntheticSource,
        this.allRetryHistory,
        {
          getStageOutput: (stage, fallback) => this.getStageOutput(stage, fallback)
        },
        {
          capturePipelineContext: snapshot => {
            pipelineSnapshot = snapshot;
          },
          skipSetPipelineContext: true,
          sourceRetryable: this.isRetryable
        }
      );
      if (!pipelineSnapshot) {
        throw new Error('Pipeline context snapshot unavailable for pipeline stage');
      }
      stageDescriptor = this.buildStageDescriptor(command, stageIndex, context, structuredInput);
      ctxManager = stageEnv.getContextManager();
      const stageOpContext = this.createPipelineOperationContext(command, stageIndex, context);

      const stageHookNode = this.createStageHookNode(command);

      const executeStage = async (): Promise<StageResult> => {
        let stageExecution: StageExecutionResult | undefined;
        while (true) {
          try {
            if ((command as InlineValueStage).type === 'inlineValue') {
              stageExecution = await this.executeInlineValueStage(
                command as InlineValueStage,
                structuredInput,
                stageEnv!
              );
            } else if ((command as InlineCommandStage).type === 'inlineCommand') {
              stageExecution = await this.executeInlineCommandStage(
                command as InlineCommandStage,
                structuredInput,
                stageEnv!,
                stageOpContext,
                stageHookNode
              );
            } else {
              stageExecution = await this.executeCommand(
                command as PipelineCommand,
                input,
                structuredInput,
                stageEnv!,
                stageOpContext,
                stageHookNode
              );
            }
            const output = stageExecution.result;
            this.rateLimiter.reset();
            break;
          } catch (err: any) {
            if (err instanceof GuardError) {
              if (err.decision === 'retry') {
                return {
                  type: 'retry',
                  reason: err.message,
                  hint: err.retryHint
                };
              }
              throw err;
            }
            if (isRateLimitError(err)) {
              if (process.env.MLLD_DEBUG === 'true') {
                logger.warn('Rate limit detected, retrying with backoff');
              }
              const retry = await this.rateLimiter.wait();
              if (retry) continue;
            }
            throw err;
          }
        }

        if (!stageExecution) {
          throw new Error('Pipeline command did not produce a result');
        }
        const output = stageExecution.result;
        if (this.isRetrySignal(output)) {
          if (process.env.MLLD_DEBUG === 'true') {
            console.error('[PipelineExecutor] Retry detected at stage', context.stage);
          }
          const from = this.parseRetryScope(output);
          const hint = this.parseRetryHint(output);
          return { type: 'retry', reason: hint || 'Stage requested retry', from, hint } as StageResult;
        }

        let normalized = this.normalizeOutput(output);
        if (this.debugStructured) {
          console.error('[PipelineExecutor][pre-output]', {
            stage: command.rawIdentifier,
            stageIndex
          });
        }
        this.logStructuredStage('output', command.rawIdentifier, stageIndex, normalized);
        if (this.debugStructured) {
          console.error('[PipelineExecutor][post-output]', {
            stage: command.rawIdentifier,
            stageIndex
          });
        }
        normalized = this.finalizeStageOutput(
          normalized,
          structuredInput,
          output,
          stageDescriptor,
          stageExecution?.labelDescriptor
        );
        if (this.debugStructured) {
          try {
            console.error('[PipelineExecutor][finalized-output]', {
              stage: command.rawIdentifier,
              stageIndex,
              labels: normalized?.ctx?.labels ?? null,
              metadataLabels: normalized?.metadata?.security?.labels ?? null
            });
          } catch {}
        }
        this.structuredOutputs.set(stageIndex, normalized);
        this.finalOutput = normalized;
        this.lastStageIndex = stageIndex;

        const normalizedText = normalized.text ?? '';
        if (!normalizedText || normalizedText.trim() === '') {
          await this.runInlineEffects(command, normalized, stageEnv!);
          return { type: 'success', output: normalizedText };
        }

        try {
          const pctx = this.env.getPipelineContext?.();
          if (pctx) {
            this.env.updatePipelineContext({
              ...pctx,
              hint: null
            });
          }
        } catch {}

        await this.runInlineEffects(command, normalized, stageEnv!);
        return { type: 'success', output: normalizedText };
      };

      const runWithinPipeline = async (): Promise<StageResult> => {
        if (ctxManager) {
          return await ctxManager.withOperation(stageOpContext, executeStage);
        }
        return await executeStage();
      };

      return await this.env.withPipeContext(pipelineSnapshot, runWithinPipeline);
    } catch (error) {
      return { type: 'error', error: error as Error };
    }
  }

  /**
   * Execute a pipeline command
   */
  /**
   * Execute a pipeline command (function or synthetic __source__).
   * CONTEXT: __source__ uses the initial input the first time, and a source function on retries.
   */
  private async executeCommand(
    command: PipelineCommand,
    input: string,
    structuredInput: StructuredValue,
    stageEnv: Environment,
    operationContext?: OperationContext,
    hookNode?: ExecInvocation
  ): Promise<StageExecutionResult> {
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
        return { result: this.initialInputText };
      }
      
      // Retry execution - need to call source function
      if (!this.sourceFunction) {
        throw new Error('Cannot retry stage 0: input is not a function. Make the source a function to enable retries.');
      }
      
      // Re-execute the source function to get fresh input
      const fresh = await this.sourceFunction();
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[PipelineExecutor] Source function returned fresh input:', fresh);
      }
      const freshWrapper = isStructuredValue(fresh)
        ? cloneStructuredValue(fresh)
        : wrapStructured(fresh, 'text', typeof fresh === 'string' ? fresh : safeJSONStringify(fresh));
      this.applySourceDescriptor(freshWrapper, fresh);
      this.initialOutput = freshWrapper;
      this.finalOutput = freshWrapper;
      this.initialInputText = freshWrapper.text;
      return { result: freshWrapper.text };
    }

    // Synthetic identity stage for pipelines that only have inline effects
    if (command.rawIdentifier === '__identity__') {
      return { result: input };
    }
    
    // Resolve the command reference
    const commandVar = await this.resolveCommandReference(command, stageEnv);
    
    if (!commandVar) {
      throw new Error(`Pipeline command ${command.rawIdentifier} not found`);
    }

    // Get arguments and validate them
    let args = await this.processArguments(command.args || [], stageEnv);

    // Execute with metadata preservation
    const { AutoUnwrapManager } = await import('../auto-unwrap-manager');

    // Smart parameter binding for pipeline functions
    if (args.length === 0) {
      args = await AutoUnwrapManager.executeWithPreservation(async () => {
        return await this.bindParametersAutomatically(commandVar, input);
      });
    }
    
    const result = await AutoUnwrapManager.executeWithPreservation(async () => {
      return await this.executeCommandVariable(commandVar, args, stageEnv, input, structuredInput, {
        hookNode,
        operationContext,
        stageInputs: [structuredInput]
      });
    });

    const labelDescriptor = this.buildCommandLabelDescriptor(command, commandVar);

    return { result, labelDescriptor };
  }

  private async executeInlineCommandStage(
    stage: InlineCommandStage,
    structuredInput: StructuredValue,
    stageEnv: Environment,
    operationContext?: OperationContext,
    hookNode?: ExecInvocation
  ): Promise<StageExecutionResult> {
    const ctxManager = stageEnv.getContextManager();
    const runInline = async (): Promise<StageExecutionResult> => {
      const { interpolate } = await import('../../core/interpreter');
      const descriptors: SecurityDescriptor[] = [];
      const commandText = await interpolate(stage.command, stageEnv, InterpolationContext.ShellCommand, {
        collectSecurityDescriptor: d => {
          if (d) descriptors.push(d);
        }
      });
      const stdinInput = structuredInput?.text ?? '';
      const result = await stageEnv.executeCommand(commandText, { input: stdinInput });
      const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
      const normalizedResult = processCommandOutput(result);
      const labelDescriptor =
        descriptors.length > 1 ? stageEnv.mergeSecurityDescriptors(...descriptors) : descriptors[0];
      return { result: normalizedResult, labelDescriptor };
    };
    if (ctxManager && operationContext) {
      return await ctxManager.withOperation(operationContext, runInline);
    }
    return await runInline();
  }

  private async executeInlineValueStage(
    stage: InlineValueStage,
    stageInput: StructuredValue,
    stageEnv: Environment
  ): Promise<StageExecutionResult> {
    const { evaluateDataValue } = await import('../data-value-evaluator');
    const value = await evaluateDataValue(stage.value, stageEnv);
    const text = safeJSONStringify(value);
    const wrapped = wrapStructured(value, 'object', text);
    const descriptor = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
    if (descriptor) {
      applySecurityDescriptorToStructuredValue(wrapped, descriptor);
      setExpressionProvenance(wrapped, descriptor);
    }
    const mergedDescriptor =
      descriptor && stageEnv ? stageEnv.mergeSecurityDescriptors(descriptor) : descriptor;
    return {
      result: this.finalizeStageOutput(wrapped, stageInput, value, mergedDescriptor),
      labelDescriptor: mergedDescriptor
    };
  }

  /**
   * Process and validate command arguments
   */
  private async processArguments(args: any[], env: Environment): Promise<any[]> {
    const evaluatedArgs: any[] = [];

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
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean' || arg === null) {
        // Preserve primitives as-is for proper parameter typing downstream
        evaluatedArgs.push(arg);
      } else if (arg && typeof arg === 'object') {
        const evaluatedArg = await this.evaluateArgumentNode(arg, env);
        evaluatedArgs.push(evaluatedArg);
      }
    }

    return evaluatedArgs;
  }

  private buildCommandLabelDescriptor(
    command: PipelineCommand,
    commandVar: any
  ): SecurityDescriptor | undefined {
    const descriptors: SecurityDescriptor[] = [];
    const inlineLabels = (command as any)?.securityLabels as DataLabel[] | undefined;
    if (inlineLabels && inlineLabels.length > 0) {
      descriptors.push(makeSecurityDescriptor({ labels: inlineLabels }));
    }
    const variableLabels = Array.isArray(commandVar?.ctx?.labels) ? (commandVar.ctx.labels as DataLabel[]) : undefined;
    if (variableLabels && variableLabels.length > 0) {
      descriptors.push(makeSecurityDescriptor({ labels: variableLabels }));
    }
    if (descriptors.length === 0) {
      return undefined;
    }
    if (descriptors.length === 1) {
      return descriptors[0];
    }
    return this.env.mergeSecurityDescriptors(...descriptors);
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
      // Resolve variable in pipeline-input context to preserve wrapper types where appropriate
      let value = await resolveVariable(variable, env, ResolutionContext.PipelineInput);

      // Apply field access if present
      if (arg.fields && arg.fields.length > 0) {
        const { accessFields } = await import('../../utils/field-access');
        const fieldResult = await accessFields(value, arg.fields, { preserveContext: false, sourceLocation: (arg as any)?.location, env });
        value = fieldResult;
      }

      // Return raw value so executables receive correctly typed params (objects/arrays/strings)
      return value;
    }

    // For other node types, interpolate
    const { interpolate } = await import('../../core/interpreter');
    const value = await interpolate([arg], env);
    // Try to preserve JSON-like structures
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
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
    stdinInput?: string,
    structuredInput?: StructuredValue,
    hookOptions?: CommandExecutionHookOptions
  ): Promise<string | { value: 'retry'; hint?: any; from?: number }> {
    const { executeCommandVariable } = await import('./command-execution');
    return await executeCommandVariable(commandVar, args, env, stdinInput, structuredInput, hookOptions);
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
    let isRetry = false;
    if (isStructuredValue(output)) {
      const data = output.data as unknown;
      isRetry =
        output.text === 'retry' ||
        typeof data === 'string' && data === 'retry' ||
        (data && typeof data === 'object' && (data as any).value === 'retry');
    } else {
      isRetry =
        output === 'retry' ||
        (output && typeof output === 'object' && (output as any).value === 'retry');
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

  private parseRetryHint(output: any): any {
    if (output && typeof output === 'object' && 'hint' in output) {
      return (output as any).hint;
    }
    return undefined;
  }

  private createPipelineOperationContext(
    command: PipelineStageEntry,
    stageIndex: number,
    stageContext: StageContext
  ): OperationContext {
    const labels = (command as any)?.securityLabels as DataLabel[] | undefined;
    return {
      type: 'pipeline-stage',
      subtype: command.rawIdentifier,
      name: command.rawIdentifier,
      labels,
      metadata: {
        stageIndex: stageIndex + 1,
        totalStages: stageContext.totalStages
      }
    };
  }

  private async executeParallelStage(
    stageIndex: number,
    commands: PipelineStageEntry[],
    input: string,
    context: StageContext
  ): Promise<StageResult> {
    try {
      const sharedStructuredInput = this.getStageOutput(stageIndex - 1, input);
      const results = await runWithConcurrency(
        commands,
        Math.min(this.parallelCap ?? getParallelLimit(), commands.length),
        async (cmd) => {
          const branchInput = cloneStructuredValue(sharedStructuredInput);
          this.logStructuredStage('input', cmd.rawIdentifier, stageIndex, branchInput, true);
          let pipelineSnapshot: PipelineContextSnapshot | undefined;
          const subEnv = await createStageEnvironment(
            cmd,
            input,
            branchInput,
            context,
            this.env,
            this.format,
            this.stateMachine.getEvents(),
            this.hasSyntheticSource,
            this.allRetryHistory,
            {
              getStageOutput: (stage, fallback) => this.getStageOutput(stage, fallback)
            },
            {
              capturePipelineContext: snapshot => {
                pipelineSnapshot = snapshot;
              },
              skipSetPipelineContext: true,
              sourceRetryable: this.isRetryable
            }
          );

          if (!pipelineSnapshot) {
            throw new Error('Pipeline context snapshot unavailable for parallel branch');
          }

          const branchCtxManager = subEnv.getContextManager();
          const stageDescriptor = this.buildStageDescriptor(cmd, stageIndex, context, branchInput);

          const branchOpContext = this.createPipelineOperationContext(cmd, stageIndex, context);
          const branchHookNode = this.createStageHookNode(cmd);

          const executeBranch = async (): Promise<{ normalized: StructuredValue; labels?: SecurityDescriptor } | { value: 'retry'; hint?: any; from?: number }> => {
            try {
              const stageExecution =
                (cmd as InlineValueStage).type === 'inlineValue'
                  ? await this.executeInlineValueStage(cmd as InlineValueStage, branchInput, subEnv)
                  : (cmd as InlineCommandStage).type === 'inlineCommand'
                    ? await this.executeInlineCommandStage(
                        cmd as InlineCommandStage,
                        branchInput,
                        subEnv,
                        branchOpContext,
                        branchHookNode
                      )
                    : await this.executeCommand(
                        cmd as PipelineCommand,
                        input,
                        branchInput,
                        subEnv,
                        branchOpContext,
                        branchHookNode
                      );
              if (this.isRetrySignal(stageExecution.result)) {
                return stageExecution.result as RetrySignal;
              }
              let normalized = this.normalizeOutput(stageExecution.result);
              this.logStructuredStage('output', cmd.rawIdentifier, stageIndex, normalized, true);
              normalized = this.finalizeStageOutput(
                normalized,
                branchInput,
                stageExecution.result,
                stageDescriptor,
                stageExecution.labelDescriptor
              );
              await this.runInlineEffects(cmd, normalized, subEnv);
              return { normalized, labels: stageExecution.labelDescriptor };
            } catch (err) {
              throw err;
            }
          };

          return await this.env.withPipeContext(pipelineSnapshot, async () => {
            if (branchCtxManager) {
              return await branchCtxManager.withOperation(branchOpContext, executeBranch);
            }
            return await executeBranch();
          });
        },
        { ordered: true, paceMs: this.delayMs }
      );

      const retrySignal = results.find(res => this.isRetrySignal(res as any));
      if (retrySignal) {
        return { type: 'error', error: new Error('retry not supported in parallel stage') };
      }

      const branchPayloads = results as Array<{ normalized: StructuredValue; labels?: SecurityDescriptor }>;
      const aggregatedData = branchPayloads.map(result => extractStageValue(result.normalized));
      const aggregatedText = safeJSONStringify(aggregatedData);
      const aggregatedBase = wrapStructured(aggregatedData, 'array', aggregatedText, {
        stages: branchPayloads.map(result => result.normalized)
      });
      const stageDescriptors = branchPayloads
        .map(result => result.labels ?? getStructuredSecurityDescriptor(result.normalized))
        .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
      const aggregatedDescriptor = stageDescriptors.length > 0
        ? mergeDescriptors(...stageDescriptors)
        : undefined;
      const aggregated = this.finalizeStageOutput(aggregatedBase, sharedStructuredInput, aggregatedData, aggregatedDescriptor);
      this.structuredOutputs.set(stageIndex, aggregated);
      this.finalOutput = aggregated;
      this.lastStageIndex = stageIndex;
      return { type: 'success', output: aggregated.text };
    } catch (err) {
      return { type: 'error', error: err as Error };
    }
  }

  private buildStageDescriptor(
    command: PipelineStageEntry,
    stageIndex: number,
    context: StageContext,
    _structuredInput: StructuredValue
  ): SecurityDescriptor | undefined {
    const labels = (command as any)?.securityLabels as DataLabel[] | undefined;
    if (labels && labels.length > 0) {
      return makeSecurityDescriptor({ labels });
    }
    return undefined;
  }

  private normalizeOutput(output: any): StructuredValue {
    this.logStructuredValue('normalize:raw', output);
    if (isStructuredValue(output)) {
      this.logStructuredValue('normalize:structured', output);
      return output;
    }
    if (isPipelineInput(output)) {
      return output;
    }

    if (output === null || output === undefined) {
      const wrapped = wrapStructured('', 'text', '');
      this.logStructuredValue('normalize:wrapped', wrapped);
      return wrapped;
    }

    if (typeof output === 'string') {
      const wrapped = wrapStructured(output, 'text', output);
      this.logStructuredValue('normalize:wrapped', wrapped);
      return wrapped;
    }

    if (typeof output === 'number' || typeof output === 'boolean' || typeof output === 'bigint') {
      const text = String(output);
      const wrapped = wrapStructured(output, 'text', text);
      this.logStructuredValue('normalize:wrapped', wrapped);
      return wrapped;
    }

    if (Array.isArray(output)) {
      const normalizedArray = output.map(item => extractStageValue(item));
      const text = safeJSONStringify(normalizedArray);
      const wrapped = wrapStructured(normalizedArray, 'array', text);
      this.logStructuredValue('normalize:wrapped', wrapped);
      return wrapped;
    }

    if (isLoadContentResult(output) || isLoadContentResultArray(output)) {
      const wrapped = wrapLoadContentValue(output);
      this.logStructuredValue('normalize:wrapped', wrapped);
      return wrapped;
    }

    if (typeof output === 'object') {
      const maybeText = typeof (output as any).content === 'string' ? (output as any).content : undefined;
      const text = maybeText ?? safeJSONStringify(output);
      const wrapped = wrapStructured(output, 'object', text);
      this.logStructuredValue('normalize:wrapped', wrapped);
      return wrapped;
    }

    const wrapped = wrapStructured(output, 'text', safeJSONStringify(output));
    this.logStructuredValue('normalize:wrapped', wrapped);
    return wrapped;
  }

  private finalizeStageOutput(
    value: StructuredValue,
    stageInput: StructuredValue,
    rawOutput: unknown,
    ...descriptorHints: (SecurityDescriptor | undefined)[]
  ): StructuredValue {
    const descriptor = this.mergeStageDescriptors(value, stageInput, rawOutput, descriptorHints);
    if (descriptor) {
      applySecurityDescriptorToStructuredValue(value, descriptor);
      setExpressionProvenance(value, descriptor);
    }
    return value;
  }

  private mergeStageDescriptors(
    normalizedValue: StructuredValue,
    stageInput: StructuredValue,
    rawOutput: unknown,
    descriptorHints: (SecurityDescriptor | undefined)[] = []
  ): SecurityDescriptor | undefined {
    const descriptors: SecurityDescriptor[] = [];
    const inputDescriptor = extractSecurityDescriptor(stageInput, {
      recursive: true,
      mergeArrayElements: true
    });
    if (inputDescriptor) {
      descriptors.push(inputDescriptor);
    }

    const rawDescriptor = extractSecurityDescriptor(rawOutput ?? normalizedValue, {
      recursive: true,
      mergeArrayElements: true
    });
    if (rawDescriptor) {
      descriptors.push(rawDescriptor);
    }

    const existingDescriptor = getStructuredSecurityDescriptor(normalizedValue);
    if (existingDescriptor) {
      descriptors.push(existingDescriptor);
    }

    for (const hint of descriptorHints) {
      if (hint) {
        descriptors.push(hint);
      }
    }

    if (process.env.MLLD_DEBUG === 'true') {
      try {
        console.error('[PipelineExecutor][mergeStageDescriptors]', {
          inputLabels: inputDescriptor?.labels ?? null,
          rawLabels: rawDescriptor?.labels ?? null,
          existingLabels: existingDescriptor?.labels ?? null,
          hintLabels: descriptorHints.map(hint => hint?.labels ?? null),
          normalizedLabels: normalizedValue?.ctx?.labels ?? null,
          normalizedText: normalizedValue?.text
        });
      } catch {}
    }

    if (descriptors.length === 0) {
      return undefined;
    }

    if (descriptors.length === 1) {
      return descriptors[0];
    }

    return this.env.mergeSecurityDescriptors(...descriptors);
  }

  private applySourceDescriptor(
    wrapper: StructuredValue,
    source: unknown
  ): void {
    const descriptor = extractSecurityDescriptor(source, {
      recursive: true,
      mergeArrayElements: true
    });
    if (!descriptor) {
      return;
    }
    applySecurityDescriptorToStructuredValue(wrapper, descriptor);
    setExpressionProvenance(wrapper, descriptor);
  }

  /**
   * Execute any inline builtin effects attached to the command/stage.
   * Effects do not count as stages and run after successful execution.
   */
  private async runInlineEffects(
    command: any,
    stageOutput: StructuredValue | string,
    stageEnv: Environment
  ): Promise<void> {
    if (!command?.effects || !Array.isArray(command.effects) || command.effects.length === 0) return;

    for (const effectCmd of command.effects) {
      try {
        if (!effectCmd?.rawIdentifier || !isBuiltinEffect(effectCmd.rawIdentifier)) continue;
        await runBuiltinEffect(effectCmd, stageOutput, stageEnv);
      } catch (err) {
        // Fail-fast on effect errors
        if (err instanceof Error) {
          throw new MlldCommandExecutionError(
            `Inline effect @${effectCmd.rawIdentifier} failed: ${err.message}`,
            undefined,
            {
              command: effectCmd.rawIdentifier,
              exitCode: 1,
              duration: 0,
              workingDirectory: process.cwd()
            }
          );
        }
        throw err;
      }
    }
  }

  private getStageOutput(stageIndex: number, fallbackText: string = ''): StructuredValue {
    if (stageIndex < 0) {
      if (!this.initialOutput) {
        this.initialOutput = wrapStructured(fallbackText, 'text', fallbackText);
      }
      return this.initialOutput;
    }

    const cached = this.structuredOutputs.get(stageIndex);
    if (cached) {
      return cached;
    }

    const wrapper = buildPipelineStructuredValue(fallbackText, 'text');
    this.structuredOutputs.set(stageIndex, wrapper);
    return wrapper;
  }

  private getFinalOutput(): StructuredValue {
    if (this.finalOutput) {
      return this.finalOutput;
    }
    if (this.lastStageIndex >= 0) {
      return this.getStageOutput(this.lastStageIndex, this.initialOutput?.text ?? '');
    }
    if (this.initialOutput) {
      return this.initialOutput;
    }
    return wrapStructured('', 'text', '');
  }

  private createStageHookNode(command: PipelineStageEntry): ExecInvocation {
    const nodeId = `pipeline-stage-${this.stageHookNodeCounter++}`;
    const commandRef: CommandReference = {
      type: 'CommandReference',
      nodeId: `${nodeId}-command`,
      identifier: command.rawIdentifier,
      args: [],
      fields: (command as any)?.fields
    };
    return {
      type: 'ExecInvocation',
      nodeId,
      commandRef,
      withClause: undefined,
      location: (command as any)?.location ?? (command as any)?.meta?.location
    };
  }

  private logStructuredStage(
    phase: 'input' | 'output',
    stageName: string,
    stageIndex: number,
    value: StructuredValue,
    isParallelBranch = false
  ): void {
    if (!this.debugStructured) {
      return;
    }
    try {
      console.error(`[PipelineExecutor][${phase}]`, {
        stage: stageName,
        stageIndex,
        parallel: isParallelBranch,
        labels: value?.ctx?.labels ?? null,
        taint: value?.ctx?.taint ?? null,
        metadataLabels: value?.metadata?.security?.labels ?? null
      });
      console.error('[PipelineExecutor][detail-start]', {
        phase,
        stage: stageName
      });
      console.error('[PipelineExecutor]', {
        phase,
        stage: stageName,
        stageIndex,
        parallel: isParallelBranch,
        type: value?.type,
        textSnippet: snippet(value?.text),
        dataPreview: previewValue(value?.data)
      });
      console.error('[PipelineExecutor][detail-end]', {
        phase,
        stage: stageName
      });
    } catch (error) {
      console.error('[PipelineExecutor][logStructuredStage:error]', {
        phase,
        stage: stageName,
        stageIndex,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  private logStructuredValue(label: string, value: unknown): void {
    if (!this.debugStructured) {
      return;
    }
    try {
      if (isStructuredValue(value)) {
        console.error('[PipelineExecutor]', {
          label,
          type: value.type,
          textSnippet: snippet(value.text),
          dataPreview: previewValue(value.data)
        });
      } else {
        console.error('[PipelineExecutor]', {
          label,
          typeofValue: typeof value,
          preview: previewValue(value)
        });
      }
    } catch (error) {
      console.error('[PipelineExecutor][logStructuredValue:error]', {
        label,
        error: error instanceof Error ? error.message : error
      });
    }
  }
}

function safeJSONStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? '');
  }
}

function extractStageValue(value: any): any {
  if (isStructuredValue(value)) {
    return asData(value);
  }
  if (isPipelineInput(value)) {
    return value.data;
  }
  return value;
}

function snippet(text: string | undefined, max: number = 120): string | undefined {
  if (!text) {
    return text;
  }
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function previewValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (isStructuredValue(value)) {
    return {
      type: value.type,
      textSnippet: snippet(value.text, 60)
    };
  }
  if (Array.isArray(value)) {
    return {
      length: value.length,
      sample: value.slice(0, 3).map(item => (isStructuredValue(item) ? { type: item.type, text: snippet(item.text, 40) } : item))
    };
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return {
      keys: keys.slice(0, 5),
      size: keys.length
    };
  }
  return value;
}

function getStructuredSecurityDescriptor(value: StructuredValue | undefined): SecurityDescriptor | undefined {
  if (!value) {
    return undefined;
  }
  if (value.ctx) {
    return ctxToSecurityDescriptor(value.ctx as StructuredValueContext);
  }
  return undefined;
}

function cloneStructuredValue<T>(value: StructuredValue<T>): StructuredValue<T> {
  const cloned = wrapStructured(value);
  inheritExpressionProvenance(cloned, value);
  return cloned;
}
