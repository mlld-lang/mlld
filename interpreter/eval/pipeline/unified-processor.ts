/**
 * Unified Pipeline Processor
 * 
 * Single entry point for all pipeline processing in the interpreter.
 * Consolidates the various pipeline handling paths into one consistent flow.
 */

import type { Environment } from '@interpreter/env/Environment';
import type { Variable } from '@core/types/variable';
import { MlldDirectiveError } from '@core/errors';
import { detectPipeline, debugPipelineDetection, type DetectedPipeline, type PipelineCommand } from './detector';
import { executePipeline } from './index';
import { isBuiltinTransformer, getBuiltinTransformers } from './builtin-transformers';
import { logger } from '@core/utils/logger';

/**
 * Context for pipeline processing
 */
export interface UnifiedPipelineContext {
  // Required
  value: any;                    // Initial value (Variable, string, object, etc.)
  env: Environment;              // Execution environment
  
  // Optional detection sources
  node?: any;                    // AST node that might have pipeline
  directive?: any;               // Directive that might have pipeline
  
  // Manual pipeline (if not auto-detected)
  pipeline?: PipelineCommand[];  // Explicit pipeline to execute
  format?: string;               // Data format hint
  isRetryable?: boolean;         // Override retryability
  
  // Metadata
  identifier?: string;           // Variable name for debugging
  location?: any;               // Source location for errors
}

/**
 * Process a value through its pipeline (if any)
 * 
 * This is the main entry point that should be used by all evaluators.
 * It handles detection, validation, execution, and type preservation.
 */
export async function processPipeline(
  context: UnifiedPipelineContext
): Promise<any> {
  const { value, env, node, directive, identifier } = context;
  
  // Debug detection
  if (identifier && process.env.MLLD_DEBUG === 'true') {
    debugPipelineDetection(identifier, node, directive);
  }
  
  // Detect pipeline from various sources
  let detected: DetectedPipeline | null = null;
  
  if (context.pipeline) {
    // Explicit pipeline provided
    detected = {
      pipeline: context.pipeline,
      source: 'directive-values', // Default source
      format: context.format,
      isRetryable: context.isRetryable ?? false
    };
  } else {
    // Auto-detect from node/directive
    detected = detectPipeline(node, directive);
    // Allow explicit override of retryability
    if (detected && context.isRetryable !== undefined) {
      detected.isRetryable = context.isRetryable;
    }
    if (process.env.MLLD_DEBUG === 'true' && identifier) {
      console.log('[processPipeline] Detection result:', {
        identifier,
        nodeType: node?.type,
        hasDetected: !!detected,
        source: detected?.source,
        pipelineLength: detected?.pipeline?.length,
        isRetryable: detected?.isRetryable
      });
    }
  }
  
  // No pipeline - return value as-is
  if (!detected || !detected.pipeline || detected.pipeline.length === 0) {
    return value;
  }
  
  // Convert retryable sources to real pipeline stages (universal context)
  let normalizedPipeline = detected.pipeline;
  
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('[processPipeline] Checking for retryable source:', {
      isRetryable: detected.isRetryable,
      hasValue: !!value,
      hasMetadata: !!(value && typeof value === 'object' && 'metadata' in value && value.metadata),
      hasSourceFunction: !!(value && typeof value === 'object' && 'metadata' in value && value.metadata && value.metadata.sourceFunction),
      valueType: value && typeof value === 'object' && 'type' in value ? value.type : typeof value
    });
  }
  
  // Check if first stage already has an executable definition (source from exec-invocation)
  const firstStage = normalizedPipeline[0];
  const hasExistingSource = firstStage && (
    (firstStage as any).executableDef ||  // Added by exec-invocation/evaluator.ts
    (firstStage as any).sourceNode ||      // Legacy source nodes
    (firstStage.type === 'execInvocation' && (firstStage as any).executableDef)
  );
  
  // Only add a source stage if we don't already have one
  if (!hasExistingSource && detected.isRetryable && value?.metadata?.sourceFunction) {
    const sourceNode = value.metadata.sourceFunction;
    const sourceCommand: PipelineCommand = {
      type: 'execInvocation' as any,
      rawIdentifier: sourceNode.identifier || sourceNode.rawIdentifier || 'source',
      identifier: sourceNode.identifier ? [sourceNode.identifier] : [],
      args: sourceNode.args || [],
      fields: sourceNode.fields || [],
      rawArgs: sourceNode.rawArgs || [],
      sourceNode  // Preserve the source node for execution
    };
    normalizedPipeline = [sourceCommand, ...detected.pipeline];
    
    if (process.env.MLLD_DEBUG === 'true') {
      console.error('[processPipeline] Created source command as stage 0:', {
        identifier: sourceCommand.rawIdentifier,
        type: sourceCommand.type
      });
    }
  }
  
  // Validate pipeline functions exist
  // Note: source commands with sourceNode are validated differently during execution
  const pipelineToValidate = normalizedPipeline.filter(cmd => !(cmd as any).sourceNode);
  await validatePipeline(pipelineToValidate, env, identifier);
  
  // LAZY SOURCE EVALUATION: Only prepare input if we don't have a retryable source
  // If we have a retryable source, it will be evaluated as stage 0 of the pipeline
  let input: string;
  let sourceFunction: (() => Promise<string>) | undefined;
  
  if (detected.isRetryable && value?.metadata?.sourceFunction) {
    const sourceNode = value.metadata.sourceFunction;
    
    // Check if the source function uses @p or @pipeline as arguments
    const needsPipelineContext = sourceNode.type === 'ExecInvocation' && 
      sourceNode.args?.some((arg: any) => 
        arg.type === 'VariableReference' && 
        (arg.identifier === 'p' || arg.identifier === 'pipeline' || arg.identifier === 'ctx')
      );
    
    if (needsPipelineContext) {
      // The source needs @p as an argument - defer evaluation completely
      // Use empty string as placeholder - the real evaluation happens in stage 0
      input = '';
      
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[processPipeline] Deferring source evaluation - needs pipeline context');
      }
    } else {
      // Source doesn't need @p - safe to evaluate now
      if (sourceNode.type === 'ExecInvocation') {
        const { evaluateExecInvocation } = await import('../exec-invocation');
        const result = await evaluateExecInvocation(sourceNode, env);
        input = String(result.value);
      } else if (sourceNode.type === 'command') {
        const { interpolate } = await import('../../core/interpreter');
        const { InterpolationContext } = await import('../../core/interpolation-context');
        const command = await interpolate(sourceNode.commandTemplate || sourceNode.nodes || [], env, InterpolationContext.ShellCommand);
        input = await env.executeCommand(command);
      } else if (sourceNode.type === 'code') {
        const { evaluateCodeExecution } = await import('../code-execution');
        const result = await evaluateCodeExecution(sourceNode, env);
        input = String(result.value);
      } else {
        // Fallback - prepare input normally
        input = await prepareInput(value, env);
      }
    }
    
    // Create source function for retrying stage 0
    sourceFunction = async () => {
      // Re-evaluate the source node to get fresh input
      // At this point, pipeline context (@p) should be available from the executor
      if (sourceNode.type === 'ExecInvocation') {
        const { evaluateExecInvocation } = await import('../exec-invocation');
        // The pipeline executor should have set the context with updated try count
        // Pass env which should have @p available as a variable
        const result = await evaluateExecInvocation(sourceNode, env);
        return String(result.value);
      } else if (sourceNode.type === 'command') {
        // This is a command executable definition, not a run directive
        // Execute it as a shell command
        const { interpolate } = await import('../../core/interpreter');
        const { InterpolationContext } = await import('../../core/interpolation-context');
        
        const command = await interpolate(sourceNode.commandTemplate || sourceNode.nodes || [], env, InterpolationContext.ShellCommand);
        const result = await env.executeCommand(command);
        return result;
      } else if (sourceNode.type === 'code') {
        const { evaluateCodeExecution } = await import('../code-execution');
        const result = await evaluateCodeExecution(sourceNode, env);
        return String(result.value);
      } else if (sourceNode.type === 'Directive') {
        // Handle run directives that store the entire directive for re-execution
        const { evaluateRun } = await import('../run');
        const result = await evaluateRun(sourceNode, env, []);
        return String(result.value);
      }
      // Fallback - return original input
      return input;
    };
  } else {
    // Non-retryable source or no source function - evaluate input normally
    input = await prepareInput(value, env);
    sourceFunction = undefined;
  }
  
  // No longer using synthetic sources - sources are real pipeline stages
  const hasSyntheticSource = false;
  
  // Execute pipeline with normalized stages
  try {
    const result = await executePipeline(
      input,
      normalizedPipeline,
      env,
      context.location,
      detected.format,
      detected.isRetryable,
      sourceFunction,
      hasSyntheticSource
    );
    
    // TODO: Type preservation - convert string result back to appropriate type
    // For now, return string result (current behavior)
    return result;
    
  } catch (error) {
    // Enhance error with context
    if (error instanceof Error) {
      const funcName = detected.pipeline[0]?.rawIdentifier || 'unknown';
      throw new MlldDirectiveError(
        `Pipeline execution failed at '@${funcName}': ${error.message}`,
        context.location
      );
    }
    throw error;
  }
}

/**
 * Validate that all pipeline functions exist
 */
async function validatePipeline(
  pipeline: PipelineCommand[],
  env: Environment,
  identifier?: string
): Promise<void> {
  for (const cmd of pipeline) {
    // Skip validation for builtin commands (show, log, output)
    if ('type' in cmd && cmd.type === 'builtinCommand') {
      continue;
    }
    
    const funcName = cmd.rawIdentifier;
    
    // Check if it's a built-in transformer
    if (isBuiltinTransformer(funcName)) {
      continue;
    }
    
    // Check if it's a defined executable
    const variable = env.getVariable(funcName);
    if (!variable) {
      throw new MlldDirectiveError(
        `Pipeline function '@${funcName}' is not defined${identifier ? ` (in @${identifier})` : ''}. ` +
        `Available functions: ${getAvailableFunctions(env).join(', ')}`
      );
    }
    
    // Check if it's actually executable
    if (variable.type !== 'executable' && variable.type !== 'computed') {
      throw new MlldDirectiveError(
        `'@${funcName}' is not a function, it's a ${variable.type} variable${identifier ? ` (in @${identifier})` : ''}`
      );
    }
  }
}

/**
 * Prepare input value for pipeline processing
 * 
 * Converts Variables and other types to strings as needed.
 * In the future, this will handle type preservation.
 */
async function prepareInput(
  value: any,
  env: Environment
): Promise<string> {
  // If it's a wrapped value with metadata (from ExecInvocation with pipeline)
  if (value && typeof value === 'object' && 'value' in value && 'metadata' in value) {
    // Extract the actual value, but keep the metadata for sourceFunction
    const actualValue = value.value;
    // Recursively prepare the actual value
    return prepareInput(actualValue, env);
  }
  
  // If it's a Variable, extract the value
  if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
    // This is a Variable - extract its value
    const { resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
    const extracted = await resolveValue(value as Variable, env, ResolutionContext.PipelineInput);
    
    // Check if the extracted value is a LoadContentResult
    const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
    if (isLoadContentResult(extracted)) {
      // For LoadContentResult, use the content property (this is what should be processed)
      // The metadata will be preserved via the AutoUnwrapManager shelf
      return extracted.content;
    }
    if (isLoadContentResultArray(extracted)) {
      // For arrays, join the contents
      return extracted.content; // This uses the custom getter that concatenates
    }
    
    // Convert to string for pipeline
    if (typeof extracted === 'string') {
      return extracted;
    }
    return JSON.stringify(extracted);
  }
  
  // Check if direct value is LoadContentResult (shouldn't happen but be safe)
  const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
  if (isLoadContentResult(value)) {
    return value.content;
  }
  if (isLoadContentResultArray(value)) {
    return value.content;
  }
  
  // Direct value - convert to string
  if (typeof value === 'string') {
    return value;
  }
  
  return JSON.stringify(value);
}

/**
 * Get list of available functions for error messages
 */
function getAvailableFunctions(env: Environment): string[] {
  const funcs: string[] = [];
  
  // Add built-in transformers
  funcs.push(...getBuiltinTransformers());
  
  // Add user-defined executables
  // TODO: Environment should provide a method to list executables
  // For now, we'll just suggest checking /exe directives
  
  return funcs;
}

/**
 * Check if a value might need pipeline processing
 * 
 * Quick check for optimization - avoids full detection if not needed.
 */
export function needsPipelineProcessing(
  node: any,
  directive?: any
): boolean {
  return !!(
    node?.pipes?.length ||
    node?.withClause?.pipeline ||
    directive?.values?.withClause?.pipeline ||
    directive?.meta?.withClause?.pipeline
  );
}