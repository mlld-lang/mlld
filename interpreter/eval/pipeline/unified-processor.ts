/**
 * Unified Pipeline Processor
 * 
 * Single entry point for all pipeline processing in the interpreter.
 * Consolidates the various pipeline handling paths into one consistent flow.
 */

import type { Environment } from '@interpreter/env/Environment';
import type { Variable } from '@core/types/variable';
import { MlldDirectiveError } from '@core/errors';
import { detectPipeline, debugPipelineDetection, type DetectedPipeline } from './detector';
import type { PipelineStage, PipelineCommand } from '@core/types';
import { PipelineExecutor } from './executor';
import { isBuiltinTransformer, getBuiltinTransformers } from './builtin-transformers';
import { logger } from '@core/utils/logger';
import { attachBuiltinEffects } from './effects-attachment';
import { isStructuredExecEnabled, wrapExecResult } from '../../utils/structured-exec';
import { ensureStructuredValue, isStructuredValue, wrapStructured, type StructuredValue, type StructuredValueMetadata } from '../../utils/structured-value';

/**
 * Context for pipeline processing
 */
/**
 * Unified pipeline processing input
 * WHY: Provide a single entry that handles detection, validation, and execution across evaluators.
 * CONTEXT: Supports explicit pipeline arrays and auto-detected tails; can mark inputs as retryable.
 */
export interface UnifiedPipelineContext {
  // Required
  value: any;                    // Initial value (Variable, string, object, etc.)
  env: Environment;              // Execution environment
  
  // Optional detection sources
  node?: any;                    // AST node that might have pipeline
  directive?: any;               // Directive that might have pipeline
  
  // Manual pipeline (if not auto-detected)
  pipeline?: PipelineStage[];  // Explicit pipeline to execute
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
/**
 * Process a value through its pipeline (if any)
 * WHY: Normalize detection across AST/directive sources and handle synthetic source stage injection.
 * GOTCHA: A synthetic __source__ stage is prepended when the base input is retryable (function source).
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
      logger.debug('[processPipeline] Detection result:', {
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
  
  // Create synthetic source stage if we have a retryable source
  const SOURCE_STAGE: PipelineCommand = {
    rawIdentifier: '__source__',
    identifier: [],
    args: [],
    fields: [],
    rawArgs: []
  };
  
  if (process.env.MLLD_DEBUG === 'true') {
    logger.debug('[processPipeline] Checking for synthetic source:', {
      isRetryable: detected.isRetryable,
      hasValue: !!value,
      hasMetadata: !!(value && typeof value === 'object' && 'metadata' in value && value.metadata),
      hasSourceFunction: !!(value && typeof value === 'object' && 'metadata' in value && value.metadata && value.metadata.sourceFunction),
      valueType: value && typeof value === 'object' && 'type' in value ? value.type : typeof value
    });
  }
  
  // Normalize pipeline - prepend source stage if retryable
  const normalizedPipeline = detected.isRetryable && value?.metadata?.sourceFunction
    ? [SOURCE_STAGE, ...detected.pipeline]
    : detected.pipeline;

  // Partition: attach builtin effect commands to the preceding functional stage
  const { functionalPipeline, hadLeadingEffects } = attachBuiltinEffects(normalizedPipeline);
  
  // Validate pipeline functions exist (skip __source__ stage)
  const pipelineToValidate = functionalPipeline.filter(cmd => cmd.rawIdentifier !== '__source__' && cmd.rawIdentifier !== '__identity__');
  await validatePipeline(pipelineToValidate, env, identifier);
  
  // Prepare input value for pipeline
  const input = await prepareInput(value, env);
  
  // Create source function for retrying stage 0 if applicable
  let sourceFunction: (() => Promise<string | StructuredValue>) | undefined;
  if (detected.isRetryable && value?.metadata?.sourceFunction) {
    // Create a function that re-executes the source AST node
    const sourceNode = value.metadata.sourceFunction;
    sourceFunction = async () => {
      // Re-evaluate the source node to get fresh input
      if (sourceNode.type === 'ExecInvocation') {
        const { evaluateExecInvocation } = await import('../exec-invocation');
        const result = await evaluateExecInvocation(sourceNode, env);
        if (structuredEnabled) {
          return wrapExecResult(result.value);
        }
        return String(result.value);
      } else if (sourceNode.type === 'command') {
        const { evaluateCommand } = await import('../run');
        const result = await evaluateCommand(sourceNode, env);
        if (structuredEnabled) {
          return wrapExecResult(result.value);
        }
        return String(result.value);
      } else if (sourceNode.type === 'code') {
        const { evaluateCodeExecution } = await import('../code-execution');
        const result = await evaluateCodeExecution(sourceNode, env);
        if (structuredEnabled) {
          return wrapExecResult(result.value);
        }
        return String(result.value);
      }
      // Fallback - return original input
      return input;
    };
  }
  
  // Store whether we added a synthetic source stage for context adjustment
  const hasSyntheticSource = functionalPipeline[0]?.rawIdentifier === '__source__';
  
  // Execute pipeline with normalized stages
  const structuredEnabled = isStructuredExecEnabled();

  try {
    const executor = new PipelineExecutor(
      functionalPipeline,
      env,
      detected.format,
      detected.isRetryable,
      sourceFunction,
      hasSyntheticSource,
      detected.parallelCap,
      detected.delayMs
    );

    if (structuredEnabled) {
      return await executor.execute(input, { returnStructured: true });
    }

    return await executor.execute(typeof input === 'string' ? input : input.text);
    
  } catch (error) {
    // Enhance error with context
    if (error instanceof Error) {
      const funcName = detected.pipeline[0]?.rawIdentifier || 'unknown';
      throw new MlldDirectiveError(
        `Pipeline execution failed at '@${funcName}': ${error.message}`,
        'pipeline',
        { location: context.location }
      );
    }
    throw error;
  }
}

/**
 * Validate that all pipeline functions exist
 */
async function validatePipeline(
  pipeline: PipelineStage[],
  env: Environment,
  identifier?: string
): Promise<void> {
  for (const stage of pipeline) {
    if (Array.isArray(stage)) {
      await validatePipeline(stage, env, identifier);
      continue;
    }
    const funcName = stage.rawIdentifier;
    
    // Check if it's a built-in transformer
    if (isBuiltinTransformer(funcName)) {
      continue;
    }
    
    // Check if it's a defined executable
    const variable = env.getVariable(funcName);
    if (!variable) {
      throw new MlldDirectiveError(
        `Pipeline function '@${funcName}' is not defined${identifier ? ` (in @${identifier})` : ''}. ` +
        `Available functions: ${getAvailableFunctions(env).join(', ')}`,
        'pipeline'
      );
    }
    
    // Check if it's actually executable
    if (variable.type !== 'executable' && variable.type !== 'computed') {
      throw new MlldDirectiveError(
        `'@${funcName}' is not a function, it's a ${variable.type} variable${identifier ? ` (in @${identifier})` : ''}`,
        'pipeline'
      );
    }
  }
}

// Note: attachBuiltinEffects is imported from './effects-attachment' above.

/**
 * Prepare input value for pipeline processing
 * 
 * Converts Variables and other types to strings as needed.
 * In the future, this will handle type preservation.
 */
async function prepareInput(
  value: any,
  env: Environment
): Promise<string | StructuredValue> {
  if (isStructuredExecEnabled()) {
    return prepareStructuredInput(value, env);
  }
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

async function prepareStructuredInput(
  value: any,
  env: Environment,
  incomingMetadata?: StructuredValueMetadata
): Promise<StructuredValue> {
  const mergedMetadata = (current?: StructuredValueMetadata): StructuredValueMetadata | undefined => {
    if (!incomingMetadata && !current) {
      return undefined;
    }
    return {
      ...(current || {}),
      ...(incomingMetadata || {})
    };
  };

  if (isStructuredValue(value)) {
    if (incomingMetadata) {
      return wrapStructured(value, value.type, value.text, mergedMetadata(value.metadata));
    }
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    'text' in value &&
    'data' in value &&
    typeof (value as any).text === 'string' &&
    typeof (value as any).type === 'string'
  ) {
    return wrapStructured(
      value as StructuredValue,
      (value as any).type,
      (value as any).text,
      mergedMetadata((value as any).metadata)
    );
  }

  if (value && typeof value === 'object' && 'value' in value && 'metadata' in value) {
    const metadata = mergedMetadata(value.metadata as StructuredValueMetadata | undefined);
    return prepareStructuredInput(value.value, env, metadata);
  }

  if (value && typeof value === 'object') {
    const { resolveValue, ResolutionContext } = await import('../../utils/variable-resolution');
    if ('type' in value && 'value' in value && 'name' in value) {
      const resolved = await resolveValue(value, env, ResolutionContext.PipelineInput);
      return prepareStructuredInput(resolved, env, incomingMetadata);
    }
  }

  const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
  if (isLoadContentResult(value)) {
    return wrapStructured(
      value,
      'object',
      value.content ?? '',
      mergedMetadata({ loadResult: value })
    );
  }

  if (isLoadContentResultArray(value)) {
    return wrapStructured(
      value,
      'array',
      value.content ?? '',
      mergedMetadata({ loadResult: value })
    );
  }

  if (typeof value === 'string') {
    return ensureStructuredValue(value, 'text', value, incomingMetadata);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return ensureStructuredValue(value, 'text', String(value), incomingMetadata);
  }

  if (Array.isArray(value)) {
    return wrapStructured(value, 'array', undefined, incomingMetadata);
  }

  if (value && typeof value === 'object') {
    return wrapStructured(value, 'object', undefined, incomingMetadata);
  }

  return ensureStructuredValue('', 'text', '', incomingMetadata);
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
