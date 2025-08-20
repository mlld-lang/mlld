import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Variable } from '@core/types/variable';
import type { IEvaluator } from '@core/universal-context';

import { CommandResolver } from './helpers/command-resolver';
import { VariableFactory } from './helpers/variable-factory';
import { ShadowEnvironmentManager } from './helpers/shadow-manager';
import { globalMetadataShelf } from './helpers/metadata-shelf';
import { ExecContextManager } from './context-manager';
import { ExecutionStrategy } from './strategies/base';
import { createStandardStrategies } from './strategies';

import { MlldInterpreterError } from '@core/errors';
import { logger } from '@core/utils/logger';
import { applyWithClause } from '../with-clause';
import { AutoUnwrapManager } from '../auto-unwrap-manager';

/**
 * Evaluates exec invocations using the strategy pattern
 * 
 * Refactored from a 1400-line monolithic function to a clean, maintainable
 * architecture. Delegates execution to specialized strategies based on the
 * executable type (template, code, command, when, for, etc.)
 * 
 * KEY IMPROVEMENTS:
 * - Strategy pattern for different execution types
 * - Centralized helper utilities (CommandResolver, VariableFactory, etc.)
 * - Universal context support for retry capabilities
 * - Clean separation of concerns
 * 
 * COMPATIBILITY: Maintains 100% backward compatibility with legacy implementation
 * FEATURE FLAG: Controlled by USE_REFACTORED_EXEC environment variable
 */
export class ExecInvocationEvaluator {
  private strategies: ExecutionStrategy[] = [];
  private autoUnwrapManager: AutoUnwrapManager;
  private contextManager: ExecContextManager;
  
  constructor() {
    this.autoUnwrapManager = new AutoUnwrapManager();
    this.contextManager = new ExecContextManager();
    this.initializeStrategies();
  }
  
  /**
   * Initialize execution strategies
   * Order matters - first matching strategy wins
   */
  private initializeStrategies(): void {
    this.strategies = createStandardStrategies();
  }
  
  /**
   * Evaluates an exec invocation node
   * 
   * Main entry point that:
   * 1. Resolves the command to its executable definition
   * 2. Handles pipeline integration if present
   * 3. Delegates to appropriate strategy for execution
   * 4. Manages auto-unwrapping for JS functions
   * 
   * @param node - ExecInvocation AST node to evaluate
   * @param env - Current execution environment
   * @param evaluator - Optional universal context evaluator
   * @returns The execution result
   * @throws {MlldInterpreterError} If command not found or execution fails
   */
  async evaluate(
    node: ExecInvocation,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    try {
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[ExecInvocationEvaluator] Entry:', {
          hasCommandRef: !!node.commandRef,
          hasWithClause: !!node.withClause,
          hasPipeline: !!(node.withClause?.pipeline)
        });
      }
      
      // Step 1: Extract command information
      const { commandName, args, objectReference } = CommandResolver.extractCommandInfo(node);
      
      // Step 2: Resolve the command variable
      const commandVariable = await CommandResolver.resolveCommand(
        commandName,
        objectReference,
        env
      );
      
      /**
       * Check for special cases before strategy execution
       * Handles @typeof transformer which needs Variable metadata access
       * Other transformers proceed through normal strategy execution
       */
      const specialResult = await this.handleSpecialCases(
        commandVariable,
        args,
        env
      );
      if (specialResult) {
        return specialResult;
      }
      
      // Step 4: Extract executable definition
      const executableDef = this.extractExecutableDefinition(commandVariable);
      
      // Step 5: Process arguments
      const processedArgs = await this.processArguments(args, env);
      
      // Step 6: Create execution context
      const parentContext = evaluator?.getContext?.();
      const execContext = this.contextManager.createExecContext(
        parentContext,
        executableDef,
        commandName
      );
      
      // Step 7: Create execution environment with parameters and context
      const execEnv = await this.createExecutionEnvironment(
        env,
        commandVariable,
        executableDef,
        processedArgs,
        node.withClause,
        execContext
      );
      
      // Step 8: Handle pipeline execution if present
      if (node.withClause?.pipeline && node.withClause.pipeline.length > 0) {
        return await this.executeWithPipeline(
          node,
          executableDef,
          execEnv,
          processedArgs,
          execContext,
          evaluator
        );
      }
      
      // Step 9: Execute using appropriate strategy
      const result = await this.executeWithStrategy(
        executableDef,
        execEnv,
        evaluator
      );
      
      // Step 10: Apply with-clause if present (non-pipeline parts)
      if (node.withClause) {
        return await applyWithClause(result, node.withClause, execEnv);
      }
      
      return result;
      
    } finally {
      /**
       * Clear metadata shelf after execution
       * CONTEXT: Metadata shelf preserves LoadContentResult through transformations
       *          Must be cleared to prevent leaking between invocations
       */
      globalMetadataShelf.clear();
    }
  }
  
  /**
   * Special handling for @typeof transformer
   * WHY: @typeof needs access to Variable metadata, not just the value
   *      Provides rich type info (directive source, property counts)
   *      Only transformer that needs Variable object access
   */
  private async handleSpecialCases(
    commandVariable: Variable,
    args: any[],
    env: Environment
  ): Promise<EvalResult | null> {
    // Check for @typeof transformer special case
    if (commandVariable.metadata?.isBuiltinTransformer && 
        commandVariable.metadata?.transformerImplementation) {
      
      const impl = commandVariable.metadata.transformerImplementation;
      const commandName = commandVariable.name;
      
      // Special handling for @typeof - needs Variable metadata
      if (commandName === 'typeof' || commandName === 'TYPEOF') {
        return await this.handleTypeofTransformer(args, env);
      }
      
      // Other transformers can be handled normally
      // This will be moved to TransformerStrategy in Phase 2
      const processedArgs = await this.processArguments(args, env);
      const result = await impl(...processedArgs);
      return { value: result, env };
    }
    
    return null;
  }
  
  /**
   * Handle @typeof transformer special case
   * Needs access to Variable object metadata, not just value
   */
  private async handleTypeofTransformer(
    args: any[],
    env: Environment
  ): Promise<EvalResult> {
    if (args.length === 0) {
      return { value: 'undefined', env };
    }
    
    const arg = args[0];
    
    // Check if it's a variable reference
    if (arg && typeof arg === 'object' && 'type' in arg && arg.type === 'VariableReference') {
      const varRef = arg as any;
      const varName = varRef.identifier;
      const varObj = env.getVariable(varName);
      
      if (varObj) {
        // Generate type information from Variable object
        let typeInfo = varObj.type;
        
        // Handle subtypes for different variable types
        if (varObj.type === 'simple-text' && 'subtype' in varObj) {
          const subtype = (varObj as any).subtype;
          if (subtype && subtype !== 'simple' && subtype !== 'interpolated-text') {
            typeInfo = subtype;
          }
        } else if (varObj.type === 'primitive' && 'primitiveType' in varObj) {
          typeInfo = `primitive (${(varObj as any).primitiveType})`;
        } else if (varObj.type === 'object') {
          const objValue = varObj.value;
          if (objValue && typeof objValue === 'object') {
            const keys = Object.keys(objValue);
            typeInfo = `object (${keys.length} properties)`;
          }
        } else if (varObj.type === 'array') {
          const arrValue = varObj.value;
          if (Array.isArray(arrValue)) {
            typeInfo = `array (${arrValue.length} items)`;
          }
        } else if (varObj.type === 'executable') {
          const execType = (varObj as any).executableType || 'unknown';
          typeInfo = `executable (${execType})`;
        }
        
        return { value: typeInfo, env };
      }
    }
    
    // Fallback to regular type checking
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const value = await extractVariableValue(arg, env);
    const typeInfo = typeof value;
    return { value: typeInfo, env };
  }
  
  /**
   * Extract executable definition from a Variable
   */
  private extractExecutableDefinition(variable: Variable): ExecutableDefinition {
    // Check metadata for executableDef (from imports)
    if (variable.metadata?.executableDef) {
      return variable.metadata.executableDef;
    }
    
    // Extract from variable properties
    const execVar = variable as any;
    
    if (!execVar.executableType) {
      throw new MlldInterpreterError(`Variable ${variable.name} is not properly configured as executable`);
    }
    
    // Build ExecutableDefinition from Variable properties
    return {
      type: execVar.executableType,
      template: execVar.template,
      language: execVar.language,
      syntaxInfo: execVar.syntaxInfo,
      body: execVar.body,
      whenExpression: execVar.whenExpression,
      forExpression: execVar.forExpression,
      sectionSelector: execVar.sectionSelector,
      resolverInfo: execVar.resolverInfo
    } as ExecutableDefinition;
  }
  
  /**
   * Process arguments, evaluating any expressions
   */
  private async processArguments(
    args: any[],
    env: Environment
  ): Promise<any[]> {
    const processed: any[] = [];
    
    for (const arg of args) {
      // Handle Variable references that need evaluation
      if (arg && typeof arg === 'object') {
        if (arg.type === 'VariableReference') {
          const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
          const value = await extractVariableValue(arg, env);
          processed.push(value);
        } else if (arg.type === 'Text') {
          processed.push(arg.content || '');
        } else if (arg.type === 'Number') {
          processed.push(arg.value);
        } else {
          // For other AST nodes, evaluate them
          const { evaluate } = await import('@interpreter/core/interpreter');
          const result = await evaluate(arg, env);
          processed.push(result.value);
        }
      } else {
        processed.push(arg);
      }
    }
    
    return processed;
  }
  
  /**
   * Create execution environment with bound parameters
   */
  private async createExecutionEnvironment(
    env: Environment,
    commandVariable: Variable,
    executableDef: ExecutableDefinition,
    args: any[],
    withClause?: WithClause,
    execContext?: any
  ): Promise<Environment> {
    const execVar = commandVariable as any;
    const paramNames = execVar.paramNames || [];
    
    // Use context manager to create environment with proper context
    let execEnv: Environment;
    
    if (execContext) {
      // Use context manager for binding
      execEnv = this.contextManager.bindParameterContext(
        execContext,
        paramNames,
        args,
        env
      );
    } else {
      // Fallback to manual binding
      execEnv = env.createChild();
      
      // Bind parameters manually
      for (let i = 0; i < paramNames.length; i++) {
        const paramName = paramNames[i];
        const value = i < args.length ? args[i] : undefined;
        
        // Create parameter variable preserving type information
        const paramVar = VariableFactory.createParameter(paramName, value);
        execEnv.setVariable(paramName, paramVar);
      }
    }
    
    // Apply captured shadow environments if present
    if (commandVariable.metadata?.capturedShadowEnvs) {
      ShadowEnvironmentManager.applyCaptured(
        execEnv,
        commandVariable.metadata.capturedShadowEnvs
      );
    }
    
    // Handle pipeline context if needed
    if (withClause?.pipeline) {
      // If we have execContext, use context manager for pipeline variables
      if (execContext) {
        this.contextManager.createPipelineVariables(execContext, execEnv);
      } else {
        // Fallback to old method
        execEnv = await this.createPipelineContext(execEnv, withClause);
      }
    }
    
    return execEnv;
  }
  
  /**
   * Create pipeline context for execution
   * This will be simplified with universal context
   */
  private async createPipelineContext(
    env: Environment,
    withClause: WithClause
  ): Promise<Environment> {
    if (!withClause.pipeline || withClause.pipeline.length === 0) {
      return env;
    }
    
    // Check if we need synthetic pipeline context
    // This happens when exec functions reference @p or @pipeline
    const needsSyntheticContext = await this.checkForPipelineReferences(env);
    
    if (needsSyntheticContext) {
      // Create synthetic pipeline context
      const syntheticContext = {
        try: 1,
        stage: 0,
        value: undefined
      };
      
      const { createObjectVariable } = await import('@core/types/variable');
      const pipelineVar = createObjectVariable('p', syntheticContext, false, undefined, {
        isPipelineContext: true,
        isSystem: true
      });
      
      env.setVariable('p', pipelineVar);
      env.setVariable('pipeline', pipelineVar);
    }
    
    return env;
  }
  
  /**
   * Check if any variables reference pipeline context
   */
  private async checkForPipelineReferences(env: Environment): Promise<boolean> {
    // Check all variables for @p or @pipeline references
    const allVars = env.getAllVariables();
    
    for (const [name, variable] of allVars) {
      if (variable.type === 'executable') {
        const execVar = variable as any;
        const template = execVar.template || '';
        
        // Check for @p. or @pipeline. references
        if (template.includes('@p.') || template.includes('@pipeline.')) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Execute using the appropriate strategy
   */
  private async executeWithStrategy(
    executableDef: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    // Find matching strategy
    for (const strategy of this.strategies) {
      if (strategy.canHandle(executableDef)) {
        return await strategy.execute(executableDef, env, evaluator);
      }
    }
    
    // No matching strategy - fallback to basic execution
    // This will be replaced once strategies are implemented
    throw new MlldInterpreterError(
      `No execution strategy found for type: ${executableDef.type}`
    );
  }
  
  /**
   * Execute with pipeline and retry support
   * CONTEXT: Everything is retryable, no special detection needed
   *          Source function re-executes with incremented @ctx.try
   */
  private async executeWithPipeline(
    node: ExecInvocation,
    executableDef: ExecutableDefinition,
    env: Environment,
    args: any[],
    execContext: any,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!node.withClause?.pipeline) {
      throw new Error('executeWithPipeline called without pipeline');
    }
    
    // Import pipeline executor
    const { executePipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    
    // Use context manager to create retryable source
    // In universal context, EVERYTHING is retryable from birth
    const retryableSource = this.contextManager.createRetryableSource(
      executableDef,
      execContext,
      this,
      env,
      args
    );
    
    // NO SYNTHETIC SOURCE NEEDED WITH UNIVERSAL CONTEXT!
    // Everything already has context from birth
    const normalizedPipeline = node.withClause.pipeline;
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[ExecInvocationEvaluator] Universal Context Pipeline:', {
        hasRetryableSource: !!retryableSource,
        pipelineLength: normalizedPipeline.length,
        stages: normalizedPipeline.map((p: any) => p.rawIdentifier || 'unknown'),
        contextInfo: {
          execDepth: execContext.metadata?.execDepth,
          execName: execContext.metadata?.execName,
          isPipeline: execContext.isPipeline
        }
      });
    }
    
    // Get initial value from first execution
    const initialResult = await this.executeWithStrategy(executableDef, env, evaluator);
    const initialValue = typeof initialResult.value === 'string'
      ? initialResult.value
      : JSON.stringify(initialResult.value);
    
    // Execute the pipeline with universal context
    // Everything is retryable, NO synthetic source needed
    const pipelineResult = await executePipeline(
      initialValue,
      normalizedPipeline,
      env,
      node.location,
      node.withClause.format,
      true,  // isRetryable - ALWAYS true in universal context
      retryableSource,  // The source function that re-executes with context
      false  // hasSyntheticSource - ALWAYS false with universal context!
    );
    
    // Apply other withClause features (trust, needs)
    if (node.withClause) {
      const withClauseWithoutPipeline = { ...node.withClause, pipeline: undefined };
      return await applyWithClause(pipelineResult, withClauseWithoutPipeline, env);
    }
    
    return pipelineResult;
  }
  
  /**
   * Register a strategy
   */
  registerStrategy(strategy: ExecutionStrategy): void {
    this.strategies.push(strategy);
  }
}

// Singleton instance
let evaluatorInstance: ExecInvocationEvaluator | null = null;

/**
 * Get or create the evaluator instance
 */
export function getEvaluator(): ExecInvocationEvaluator {
  if (!evaluatorInstance) {
    evaluatorInstance = new ExecInvocationEvaluator();
  }
  return evaluatorInstance;
}