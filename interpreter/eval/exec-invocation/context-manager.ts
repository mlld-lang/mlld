import type { UniversalContext } from '@core/universal-context';
import type { Environment } from '@interpreter/env/Environment';
import type { ExecutableDefinition } from '@core/types/executable';
import type { Variable } from '@core/types/variable';
import type { ExecInvocationEvaluator } from './evaluator';

import { createDefaultContext } from '@core/universal-context';
import { VariableFactory } from './helpers/variable-factory';

/**
 * Context Manager for exec-invocation
 * Handles context flow, retryability, and pipeline integration
 * 
 * This is crucial for pipeline support because it:
 * 1. Creates proper contexts for retryability
 * 2. Manages the source function that pipelines can retry
 * 3. Tracks execution depth and metadata
 * 4. Provides clean separation between exec logic and context management
 */
export class ExecContextManager {
  /**
   * Creates execution context for an exec invocation
   * 
   * UNIVERSAL CONTEXT PHILOSOPHY:
   * - Everything has context from birth
   * - Everything is potentially retryable
   * - Context flows naturally, not through synthetic wrapping
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
        const paramVar = VariableFactory.createParameter(paramName, args[i]);
        execEnv.setVariable(paramName, paramVar);
      }
    });
    
    return execEnv;
  }
  
  /**
   * Prepares retryable source function for pipeline integration
   * 
   * KEY INSIGHT: In universal context, this doesn't create synthetic wrapping!
   * It just returns a function that re-executes with updated context.
   * The executable ALREADY has context from birth and can access @p.try naturally.
   */
  createRetryableSource(
    executable: ExecutableDefinition,
    context: UniversalContext,
    evaluator: ExecInvocationEvaluator,
    originalEnv: Environment,
    args: any[]
  ): (() => Promise<string>) {
    // EVERYTHING is retryable in universal context!
    // No need to check isRetryable() - that's legacy thinking
    
    // Return a source function that re-executes with updated retry context
    return async () => {
      // Update context for retry (not wrapping, just updating!)
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
      
      // Set the retry context - the executable can access @p.try naturally!
      if ('setUniversalContext' in retryEnv && typeof retryEnv.setUniversalContext === 'function') {
        retryEnv.setUniversalContext(retryContext);
      }
      
      // Create pipeline variables so exec can access @p.try
      this.createPipelineVariables(retryContext, retryEnv);
      
      // Re-bind parameters for retry with proper context
      const params = (executable as any).paramNames || [];
      params.forEach((paramName: string, i: number) => {
        if (i < args.length) {
          const paramVar = VariableFactory.createParameter(paramName, args[i]);
          retryEnv.setVariable(paramName, paramVar);
        }
      });
      
      // Re-execute with retry context - NO WRAPPING!
      // The executable naturally has access to @p.try through context
      const result = await evaluator.executeWithStrategy(executable, retryEnv);
      return String(result.value);
    };
  }
  
  /**
   * Creates pipeline context variables (@p and @pipeline)
   */
  createPipelineVariables(
    context: UniversalContext,
    env: Environment
  ): void {
    const pipelineObj = {
      try: context.try || 1,
      stage: context.stage || 0,
      value: context.value,
      retry: context.retry || 1,
      metadata: context.metadata
    };
    
    // Create pipeline context variables
    const { createObjectVariable } = require('@core/types/variable');
    const pipelineVar = createObjectVariable('p', pipelineObj, false, undefined, {
      isPipelineContext: true,
      isSystem: true
    });
    
    env.setVariable('p', pipelineVar);
    env.setVariable('pipeline', pipelineVar);
  }
  
  /**
   * Universal Context Philosophy: EVERYTHING is retryable
   * 
   * This eliminates entire classes of detection logic:
   * - Static strings are retryable (return same value)
   * - Variables are retryable (return same value)
   * - Functions are retryable (might return different values)
   * - Commands are retryable (will return different values)
   * 
   * The pipeline doesn't need to "know" what's retryable - it just
   * retries and lets the source decide what to return.
   */
  
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