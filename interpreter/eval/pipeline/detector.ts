/**
 * Central pipeline detection and extraction
 * 
 * This module provides a unified way to detect and extract pipelines
 * from various AST node structures and directive contexts.
 */

import type { DirectiveNode } from '@core/types';
import type { PipelineCommand } from '@core/types';

// PipelineCommand type is defined centrally in core/types/run.ts

/**
 * Unified pipeline detection result
 */
export interface DetectedPipeline {
  pipeline: PipelineCommand[];
  source: 'node-pipes' | 'node-withClause' | 'directive-values' | 'directive-meta';
  format?: string;
  isRetryable?: boolean;
}

/**
 * Extract pipeline from any supported source
 * 
 * This function checks all possible locations where a pipeline might be stored
 * in the AST or directive metadata, providing a single point of detection.
 * 
 * @param node The AST node that might have a pipeline
 * @param directive The directive context (may contain pipeline in values or meta)
 * @returns Detected pipeline info or null if no pipeline found
 */
export function detectPipeline(
  node: any,
  directive?: DirectiveNode
): DetectedPipeline | null {
  // Priority order matters - check most specific first
  
  // 1. Check node.pipes (VariableReference with condensed pipes)
  if (node && Array.isArray(node.pipes) && node.pipes.length > 0) {
    // Convert condensed pipe format to standard pipeline format
    const pipeline = node.pipes.map(convertCondensedPipe);
    return {
      pipeline,
      source: 'node-pipes',
      isRetryable: false // Variable pipes are not retryable
    };
  }
  
  // 2. Check node.withClause (ExecInvocation, some VariableReferences)
  if (node && node.withClause && node.withClause.pipeline) {
    return {
      pipeline: node.withClause.pipeline,
      source: 'node-withClause',
      format: node.withClause.format,
      isRetryable: node.type === 'ExecInvocation' // Functions can be retried
    };
  }
  
  // 3. Check directive.values.withClause (directive-level pipeline)
  if (directive?.values?.withClause && directive.values.withClause.pipeline) {
    return {
      pipeline: directive.values.withClause.pipeline,
      source: 'directive-values',
      format: directive.values.withClause.format,
      isRetryable: false // Literal values are not retryable by default
    };
  }
  
  // 4. Check directive.meta.withClause (fallback for some literal cases)
  if (directive?.meta?.withClause && directive.meta.withClause.pipeline) {
    return {
      pipeline: directive.meta.withClause.pipeline,
      source: 'directive-meta',
      format: directive.meta.withClause.format,
      isRetryable: false
    };
  }
  
  // No pipeline found
  return null;
}

/**
 * Convert condensed pipe format to standard pipeline command
 * 
 * Condensed pipes (from @var|@transform syntax) need to be converted
 * to the standard PipelineCommand format used by executePipeline.
 */
function convertCondensedPipe(pipe: any): PipelineCommand {
  // Handle different condensed pipe formats
  if (pipe.type === 'CondensedPipe') {
    return {
      identifier: [{
        type: 'VariableReference',
        valueType: 'varIdentifier',
        identifier: pipe.transform
      }],
      args: pipe.args || [],
      fields: [],
      rawIdentifier: pipe.transform,
      rawArgs: pipe.args || []
    };
  }
  
  // Already in correct format or unknown format - pass through
  return pipe;
}

/**
 * Check if a value might have a pipeline attached
 * 
 * Quick check without full extraction - useful for optimization.
 */
export function hasPipeline(node: any, directive?: DirectiveNode): boolean {
  return !!(
    node?.pipes?.length ||
    node?.withClause?.pipeline ||
    directive?.values?.withClause?.pipeline ||
    directive?.meta?.withClause?.pipeline
  );
}

/**
 * Extract all pipeline-related metadata from various sources
 * 
 * This includes not just the pipeline commands but also format,
 * trust levels, dependencies, etc.
 */
export function extractPipelineMetadata(
  node: any,
  directive?: DirectiveNode
): {
  pipeline?: PipelineCommand[];
  format?: string;
  trust?: string;
  needs?: any;
  asSection?: string;
} | null {
  // Check all withClause sources
  const withClause = 
    node?.withClause ||
    directive?.values?.withClause ||
    directive?.meta?.withClause;
    
  if (withClause) {
    return {
      pipeline: withClause.pipeline,
      format: withClause.format,
      trust: withClause.trust,
      needs: withClause.needs,
      asSection: withClause.asSection
    };
  }
  
  // Check condensed pipes (only have pipeline, no other metadata)
  if (node?.pipes?.length) {
    return {
      pipeline: node.pipes.map(convertCondensedPipe)
    };
  }
  
  return null;
}

/**
 * Debug helper to log pipeline detection details
 */
export function debugPipelineDetection(
  identifier: string,
  node: any,
  directive?: DirectiveNode
): void {
  if (process.env.MLLD_DEBUG !== 'true') return;
  
  console.log(`\n=== Pipeline Detection for @${identifier} ===`);
  
  const sources = [];
  if (node?.pipes?.length) sources.push(`node.pipes (${node.pipes.length} pipes)`);
  if (node?.withClause?.pipeline) sources.push('node.withClause');
  if (directive?.values?.withClause?.pipeline) sources.push('directive.values.withClause');
  if (directive?.meta?.withClause?.pipeline) sources.push('directive.meta.withClause');
  
  if (sources.length === 0) {
    console.log('  No pipeline found');
  } else {
    console.log('  Pipeline sources found:', sources.join(', '));
    
    const detected = detectPipeline(node, directive);
    if (detected) {
      console.log('  Selected source:', detected.source);
      console.log('  Pipeline:', detected.pipeline.map(p => p.rawIdentifier).join(' | '));
      console.log('  Format:', detected.format || 'none');
      console.log('  Retryable:', detected.isRetryable);
    }
  }
}
