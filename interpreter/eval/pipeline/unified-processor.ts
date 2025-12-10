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
import type { PipelineStage, PipelineCommand, WhilePipelineStage } from '@core/types';
import { PipelineExecutor } from './executor';
import { isBuiltinTransformer, getBuiltinTransformers } from './builtin-transformers';
import { logger } from '@core/utils/logger';
import { attachBuiltinEffects } from './effects-attachment';
import { wrapExecResult } from '../../utils/structured-exec';
import {
  ensureStructuredValue,
  isStructuredValue,
  wrapStructured,
  extractSecurityDescriptor,
  applySecurityDescriptorToStructuredValue,
  type StructuredValue,
  type StructuredValueMetadata
} from '../../utils/structured-value';
import { ctxToSecurityDescriptor } from '@core/types/variable/CtxHelpers';
import { inheritExpressionProvenance, setExpressionProvenance } from '../../utils/expression-provenance';
import { makeSecurityDescriptor, mergeDescriptors, type SecurityDescriptor, type DataLabel } from '@core/types/security';
import { wrapLoadContentValue } from '../../utils/load-content-structured';
import { resolveNestedValue } from '../../utils/display-materialization';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';

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
  descriptorHint?: SecurityDescriptor; // Optional descriptor hint when value lost metadata
  
  // Optional detection sources
  node?: any;                    // AST node that might have pipeline
  directive?: any;               // Directive that might have pipeline
  
  // Manual pipeline (if not auto-detected)
  pipeline?: PipelineStage[];  // Explicit pipeline to execute
  format?: string;               // Data format hint
  isRetryable?: boolean;         // Override retryability
  stream?: boolean;              // Enable streaming for this pipeline
  
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
  const { value, env, node, directive, identifier, descriptorHint } = context;
  const streamRequested =
    context.stream ??
    Boolean(
      (node as any)?.withClause?.stream ??
      (directive as any)?.values?.withClause?.stream ??
      (directive as any)?.meta?.withClause?.stream
    );
  const sourceNode = getSourceFunctionFromValue(value);
  const descriptorFromValue = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  const descriptorFromAst = extractDescriptorFromAst(node, env);
  if (process.env.MLLD_DEBUG === 'true') {
    const payload = {
      nodeType: node?.type,
      descriptorFromValue,
      descriptorFromAst,
      descriptorHint
    };
    console.error('[processPipeline] descriptor sources', payload);
    try {
      const fs = await import('node:fs');
      fs.appendFileSync('/tmp/pipeline-debug.log', `${JSON.stringify(payload)}\n`);
    } catch {}
  }
  let pipelineDescriptor: SecurityDescriptor | undefined =
    descriptorHint ?? descriptorFromValue ?? descriptorFromAst;
  const directiveLabels = directive
    ? (directive.meta?.securityLabels || directive.values?.securityLabels) as DataLabel[] | undefined
    : undefined;
  if (directiveLabels && directiveLabels.length > 0) {
    pipelineDescriptor = mergeDescriptors(
      pipelineDescriptor,
      makeSecurityDescriptor({ labels: directiveLabels })
    );
  }
  if (pipelineDescriptor) {
    env.recordSecurityDescriptor(pipelineDescriptor);
  }
  
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
      isRetryable: context.isRetryable ?? true
    };
  } else {
    // Auto-detect from node/directive
    detected = detectPipeline(node, directive);
    // Allow explicit override of retryability
    if (detected && context.isRetryable !== undefined) {
      detected.isRetryable = context.isRetryable;
    }
    if (detected && detected.pipeline && detected.pipeline.length > 0 && detected.isRetryable === false) {
      // Default to retryable sources; static inputs retry by reusing original value
      detected.isRetryable = true;
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
      hasMetadata: !!(value && typeof value === 'object' && ('ctx' in value || 'internal' in value) && ((value as any).ctx || (value as any).internal)),
      hasSourceFunction: !!sourceNode,
      valueType: value && typeof value === 'object' && 'type' in value ? value.type : typeof value
    });
  }
  
  // Keep pipeline stages as defined; retryability handled by executor/state-machine
  const normalizedPipeline = detected.pipeline;

  // Partition: attach builtin effect commands to the preceding functional stage
  const { functionalPipeline, hadLeadingEffects } = attachBuiltinEffects(normalizedPipeline);
  
  // Validate pipeline functions exist (skip __source__ stage)
  const pipelineToValidate = functionalPipeline.filter(cmd => cmd.rawIdentifier !== '__source__' && cmd.rawIdentifier !== '__identity__');
  await validatePipeline(pipelineToValidate, env, identifier);
  
  // Prepare input value for pipeline
  const input = await prepareInput(value, env, pipelineDescriptor);
  
  // Create source function for retrying stage 0 if applicable
  const attachDescriptorToRetryInput = (value: unknown): string | StructuredValue => {
    if (!pipelineDescriptor) {
      return value as string | StructuredValue;
    }
    const wrapped = isStructuredValue(value) ? value : wrapExecResult(value);
    applySecurityDescriptorToStructuredValue(wrapped, pipelineDescriptor);
    setExpressionProvenance(wrapped, pipelineDescriptor);
    return wrapped;
  };

  // Create a function that replays the source; for static inputs, reuse the original value
  let sourceFunction: (() => Promise<string | StructuredValue>) | undefined;
  if (detected.isRetryable) {
    if (sourceNode) {
      sourceFunction = async () => {
        if (sourceNode.type === 'ExecInvocation') {
          const { evaluateExecInvocation } = await import('../exec-invocation');
          const result = await evaluateExecInvocation(sourceNode, env);
          return attachDescriptorToRetryInput(result.value);
        }
        if (sourceNode.type === 'command') {
          const { evaluateCommand } = await import('../run');
          const result = await evaluateCommand(sourceNode, env);
          return attachDescriptorToRetryInput(structuredEnabled ? result.value : String(result.value));
        }
        if (sourceNode.type === 'code') {
          const { evaluateCodeExecution } = await import('../code-execution');
          const result = await evaluateCodeExecution(sourceNode, env);
          return attachDescriptorToRetryInput(result.value);
        }
        return attachDescriptorToRetryInput(input);
      };
    } else {
      // Static input: retry by returning the same input value
      const cachedInput = attachDescriptorToRetryInput(input);
      sourceFunction = async () => cachedInput;
    }
  }
  
  // Store whether we added a synthetic source stage for context adjustment
  const hasSyntheticSource = functionalPipeline[0]?.rawIdentifier === '__source__';
  
  // Execute pipeline with normalized stages
let executionResult: StructuredValue;
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
    executionResult = await executor.execute(input, {
      returnStructured: true,
      stream: streamRequested
    }) as StructuredValue;

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
  if (pipelineDescriptor && isStructuredValue(executionResult)) {
    const metadata: StructuredValueMetadata = {
      ...(executionResult.metadata || {}),
      security: pipelineDescriptor
    };
    return wrapStructured(executionResult, undefined, undefined, metadata);
  }
  if (pipelineDescriptor) {
    env.recordSecurityDescriptor(pipelineDescriptor);
  }
  return executionResult;
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
    if ((stage as any).type === 'whileStage') {
      const processorName = getWhileProcessorName(stage as WhilePipelineStage);
      if (!processorName) {
        continue;
      }
      const variable = env.getVariable(processorName);
      if (!variable) {
        throw new MlldDirectiveError(
          `While processor '@${processorName}' is not defined${identifier ? ` (in @${identifier})` : ''}. ` +
            `Available functions: ${getAvailableFunctions(env).join(', ')}`,
          'pipeline'
        );
      }
      if (variable.type !== 'executable' && variable.type !== 'computed') {
        throw new MlldDirectiveError(
          `'@${processorName}' is not a function, it's a ${variable.type}${identifier ? ` (in @${identifier})` : ''}`,
          'pipeline'
        );
      }
      continue;
    }
    if ((stage as any).type === 'inlineCommand' || (stage as any).type === 'inlineValue') {
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

function getWhileProcessorName(stage: WhilePipelineStage): string | undefined {
  const processor = (stage as any)?.processor;
  if (!processor) {
    return undefined;
  }

  if (processor.commandRef) {
    const ref = processor.commandRef;
    if (ref.name) {
      return ref.name;
    }
    if (Array.isArray(ref.identifier)) {
      const candidate = ref.identifier.map((id: any) => id.identifier || id.content || '').find(Boolean);
      if (candidate) {
        return candidate;
      }
    } else if (ref.identifier) {
      return ref.identifier;
    }
  }

  if (processor.identifier) {
    return processor.identifier;
  }

  if (Array.isArray(processor.identifier) && processor.identifier[0]?.identifier) {
    return processor.identifier[0].identifier;
  }

  if (processor.rawIdentifier) {
    return processor.rawIdentifier;
  }

  return undefined;
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
  env: Environment,
  descriptor?: SecurityDescriptor
): Promise<string | StructuredValue> {
  return prepareStructuredInput(value, env, undefined, descriptor);
}

async function prepareStructuredInput(
  value: any,
  env: Environment,
  incomingMetadata?: StructuredValueMetadata,
  providedDescriptor?: SecurityDescriptor
): Promise<StructuredValue> {
  const sourceDescriptor = providedDescriptor ?? extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  const finalizeWrapper = (wrapper: StructuredValue): StructuredValue => {
    if (sourceDescriptor) {
      applySecurityDescriptorToStructuredValue(wrapper, sourceDescriptor);
      setExpressionProvenance(wrapper, sourceDescriptor);
    } else {
      inheritExpressionProvenance(wrapper, value);
    }
    return wrapper;
  };
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
    const normalizedData = sanitizeStructuredData(value.data);
    return finalizeWrapper(
      wrapStructured(normalizedData, value.type, value.text, mergedMetadata(value.metadata))
    );
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
    const normalizedData = sanitizeStructuredData((value as any).data);
    return finalizeWrapper(
      wrapStructured(normalizedData, (value as any).type, (value as any).text, mergedMetadata((value as any).metadata))
    );
  }

  if (value && typeof value === 'object' && 'value' in value && ('ctx' in value || 'internal' in value)) {
    const metadata = mergedMetadata(undefined);
    const nested = await prepareStructuredInput(value.value, env, metadata, providedDescriptor);
    return finalizeWrapper(nested);
  }

  if (value && typeof value === 'object') {
    const { resolveValue, ResolutionContext } = await import('../../utils/variable-resolution');
    if ('type' in value && 'value' in value && 'name' in value) {
      const resolved = await resolveValue(value, env, ResolutionContext.PipelineInput);
      const nested = await prepareStructuredInput(resolved, env, incomingMetadata, providedDescriptor);
      return finalizeWrapper(nested);
    }
  }

  if (isLoadContentResult(value) || isLoadContentResultArray(value)) {
    const wrapped = wrapLoadContentValue(value);
    return finalizeWrapper(
      wrapStructured(
        wrapped,
        wrapped.type,
        wrapped.text,
        mergedMetadata(wrapped.metadata)
      )
    );
  }

  if (typeof value === 'string') {
    return finalizeWrapper(ensureStructuredValue(value, 'text', value, incomingMetadata));
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return finalizeWrapper(ensureStructuredValue(value, 'text', String(value), incomingMetadata));
  }

  if (Array.isArray(value)) {
    const normalizedArray = value.map(item => sanitizeStructuredData(item));
    return finalizeWrapper(wrapStructured(normalizedArray, 'array', undefined, incomingMetadata));
  }

  if (value && typeof value === 'object') {
    const normalizedObject = sanitizeStructuredData(value);
    return finalizeWrapper(
      wrapStructured(normalizedObject as Record<string, unknown>, 'object', undefined, incomingMetadata)
    );
  }

  return finalizeWrapper(ensureStructuredValue('', 'text', '', incomingMetadata));
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

function sanitizeStructuredData(value: unknown): unknown {
  return resolveNestedValue(value, { preserveProvenance: true });
}

function extractDescriptorFromAst(node: any, env: Environment): SecurityDescriptor | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  if (node.type === 'ExecInvocation' && node.commandRef) {
    const execDescriptor =
      extractDescriptorFromAst(node.commandRef.objectReference, env) ??
      extractDescriptorFromAst(node.commandRef.objectSource, env);
    if (execDescriptor) {
      return execDescriptor;
    }
    if (typeof node.commandRef.identifier === 'string') {
      const variable = env.getVariable(node.commandRef.identifier);
      if (variable?.ctx) {
        return ctxToSecurityDescriptor(variable.ctx);
      }
    } else if (Array.isArray(node.commandRef.identifier)) {
      for (const identifierNode of node.commandRef.identifier) {
        const descriptor = extractDescriptorFromAst(identifierNode, env);
        if (descriptor) {
          return descriptor;
        }
      }
    }
  }

  if (node.type === 'VariableReference' && typeof node.identifier === 'string') {
    const variable = env.getVariable(node.identifier);
    if (variable?.ctx) {
      return ctxToSecurityDescriptor(variable.ctx);
    }
  }

  if (node.objectReference) {
    const descriptor = extractDescriptorFromAst(node.objectReference, env);
    if (descriptor) {
      return descriptor;
    }
  }

  if (node.commandRef?.objectReference) {
    const descriptor = extractDescriptorFromAst(node.commandRef.objectReference, env);
    if (descriptor) {
      return descriptor;
    }
  }
  if (node.commandRef?.objectSource) {
    const descriptor = extractDescriptorFromAst(node.commandRef.objectSource, env);
    if (descriptor) {
      return descriptor;
    }
  }

  if (Array.isArray(node.value)) {
    for (const child of node.value) {
      const descriptor = extractDescriptorFromAst(child, env);
      if (descriptor) {
        return descriptor;
      }
    }
  }

  return undefined;
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

function getSourceFunctionFromValue(value: unknown): any | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as { internal?: Record<string, unknown> };
  if (candidate.internal && candidate.internal.sourceFunction) {
    return candidate.internal.sourceFunction;
  }
  return undefined;
}
