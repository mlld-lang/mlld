import type { UniversalContext } from '@core/universal-context';
import type { Environment } from '@interpreter/env/Environment';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Variable } from '@core/types/variable';
import type { ExecInvocationEvaluator } from './evaluator';

import { createDefaultContext } from '@core/universal-context';
import { VariableFactory } from './helpers/variable-factory';

/**
 * Manages execution context for retryable operations
 * WHY: Pipeline sources need to be retryable without knowing who requested retry
 *      Every executable has context from birth and can access @ctx.try naturally
 */
export class ExecContextManager {
  /**
   * Creates execution context for an exec invocation
   */
  createExecContext(
    parentContext: UniversalContext | undefined,
    executable: ExecutableDefinition,
    commandName?: string
  ): UniversalContext {
    const baseContext = parentContext || createDefaultContext();
    
    return {
      ...baseContext,
      stage: 0,  // Exec functions start at stage 0
      isPipeline: false,  // Not yet part of pipeline (will be true on retry)
      try: baseContext.try || 1,  // Inherit retry count or start at 1
      metadata: {
        ...baseContext.metadata,
        execDepth: (baseContext.metadata?.execDepth || 0) + 1,
        execName: commandName || executable.name || 'anonymous',
        // EVERYTHING is retryable in universal context!
        isRetryable: true,
        executableType: executable.type,
        // Track that this has context from birth
        hasUniversalContext: true
      }
    };
  }
  
  /**
   * Creates environment with bound parameters and proper context
   */
  bindParameterContext(
    context: UniversalContext,
    params: string[],
    args: any[],
    parentEnv: Environment
  ): Environment {
    const execEnv = parentEnv.createChild();
    
    // Set the universal context if environment supports it
    if ('setUniversalContext' in execEnv && typeof execEnv.setUniversalContext === 'function') {
      execEnv.setUniversalContext(context);
    }
    
    // Bind parameters with proper Variable types
    params.forEach((paramName, i) => {
      if (i < args.length) {
        const arg = args[i];
        
        // Check if the argument is already a Variable
        let paramVar;
        if (arg && typeof arg === 'object' && 'type' in arg && 'name' in arg && 'value' in arg) {
          // It's a Variable - pass it as the third parameter to preserve metadata
          // Note: Complex Variables with AST need to be resolved before this point
          // The evaluator's processArguments should have already done this
          paramVar = VariableFactory.createParameter(paramName, arg.value, arg);
        } else {
          // Raw value - create new Variable
          paramVar = VariableFactory.createParameter(paramName, arg);
        }
        
        // Mark as parameter to bypass reserved name check
        paramVar.metadata = {
          ...paramVar.metadata,
          isSystem: true,
          isParameter: true
        };
        execEnv.setParameterVariable(paramName, paramVar);
      }
    });
    
    return execEnv;
  }
  
  /**
   * Creates retryable source function for pipeline integration
   * WHY: Sources can be retried by pipelines without special awareness
   *      The executable just re-executes with updated @ctx.try count
   */
  createRetryableSource(
    executable: ExecutableDefinition,
    context: UniversalContext,
    evaluator: ExecInvocationEvaluator,
    originalEnv: Environment,
    args: any[]
  ): (() => Promise<string>) {
    return async () => {
      /**
       * Re-execute with retry context
       * GOTCHA: Fresh environment created but parameters re-bound
       *         Context variables (@ctx) updated with new try count
       *         Original arguments preserved across retries
       */
      const retryContext: UniversalContext = {
        ...context,
        try: (context.try || 1) + 1,  // Increment retry count
        isPipeline: true,  // Now explicitly part of pipeline
        stage: 0,  // Source is stage 0 (no synthetic stage needed!)
        metadata: {
          ...context.metadata,
          isRetry: true,
          originalTry: context.try || 1
        }
      };
      
      // Create fresh environment with retry context
      const retryEnv = originalEnv.createChild();
      
      if ('setUniversalContext' in retryEnv && typeof retryEnv.setUniversalContext === 'function') {
        retryEnv.setUniversalContext(retryContext);
      }
      
      // Create pipeline variables so exec can access @ctx.try
      await this.createPipelineVariables(retryContext, retryEnv);
      
      // Re-bind parameters for retry with proper context
      const params = (executable as any).paramNames || [];
      params.forEach((paramName: string, i: number) => {
        if (i < args.length) {
          const arg = args[i];
          
          // Check if the argument is already a Variable
          let paramVar;
          if (arg && typeof arg === 'object' && 'type' in arg && 'name' in arg && 'value' in arg) {
            // It's a Variable - pass it as the third parameter to preserve metadata
            // Note: Complex Variables with AST need to be resolved before this point
            // The evaluator's processArguments should have already done this
            paramVar = VariableFactory.createParameter(paramName, arg.value, arg);
          } else {
            // Raw value - create new Variable
            paramVar = VariableFactory.createParameter(paramName, arg);
          }
          
          // Mark as parameter for retry context
          paramVar.metadata = {
            ...paramVar.metadata,
            isSystem: true,
            isParameter: true
          };
          retryEnv.setParameterVariable(paramName, paramVar);
        }
      });
      
      const result = await evaluator.executeWithStrategy(executable, retryEnv);
      return String(result.value);
    };
  }
  
  /**
   * Creates context variables for universal context access
   * @ctx is the primary variable, @p/@pipeline are legacy aliases
   * Legacy aliases will be removed after test migration
   */
  async createPipelineVariables(
    context: UniversalContext,
    env: Environment
  ): Promise<void> {
    const contextObj = {
      try: context.try || 1,
      stage: context.stage || 0,
      value: context.value,
      retry: context.retry || 1,
      metadata: context.metadata,
      tries: [],  // Track retry history for compatibility
      length: 0   // Pipeline length for compatibility
    };
    
    // Create context variable
    const { createObjectVariable } = await import('@core/types/variable');
    const contextVar = createObjectVariable('ctx', contextObj, false, undefined, {
      isPipelineContext: true,
      isSystem: true
    });
    
    // Primary context variable
    env.setVariable('ctx', contextVar);
    
    // Legacy aliases - will be deprecated after test migration
    env.setVariable('p', contextVar);
    env.setVariable('pipeline', contextVar);
  }
  
  
  /**
   * Merges execution result with context
   */
  mergeResultContext(
    result: any,
    context: UniversalContext
  ): UniversalContext {
    return {
      ...context,
      value: result,
      metadata: {
        ...context.metadata,
        lastResult: result,
        executionComplete: true
      }
    };
  }
  
  /**
   * Check if context indicates a retry
   */
  isRetryContext(context: UniversalContext): boolean {
    return !!(context.metadata?.isRetry || context.try > 1);
  }
  
  /**
   * Create a context for pipeline stage execution
   */
  createPipelineStageContext(
    parentContext: UniversalContext,
    stageIndex: number
  ): UniversalContext {
    return {
      ...parentContext,
      stage: stageIndex,
      isPipeline: true,
      metadata: {
        ...parentContext.metadata,
        pipelineStage: stageIndex
      }
    };
  }
}