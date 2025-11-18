import type { CondensedPipe, FieldAccessNode, FileReferenceNode } from '@core/types';
import type { LoadContentResult } from '@core/types/load-content';
import { normalizeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import type { Environment } from '../env/Environment';
import type { InterpolationContext } from '../core/interpolation-context';

export interface InterpolationNode {
  type: string;
  content?: string;
  name?: string;
  identifier?: string;
  fields?: FieldAccessNode[];
  value?: string;
  commandRef?: any;
  withClause?: any;
  pipes?: CondensedPipe[];
}

export interface InterpolateOptions {
  collectSecurityDescriptor?: (descriptor: SecurityDescriptor) => void;
}

export type InterpolateFunction = (
  nodes: any,
  env: Environment,
  context?: InterpolationContext,
  options?: InterpolateOptions
) => Promise<string>;

export function extractInterpolationDescriptor(value: unknown): SecurityDescriptor | undefined {
  if (!value) {
    return undefined;
  }
  if (isStructuredValue(value)) {
    return normalizeSecurityDescriptor(value.ctx as SecurityDescriptor | undefined);
  }
  if (typeof value === 'object') {
    const ctx = (value as { ctx?: SecurityDescriptor }).ctx;
    return normalizeSecurityDescriptor(ctx as SecurityDescriptor | undefined);
  }
  return undefined;
}

/**
 * Interpolate file reference nodes (<file.md>) with optional field access and pipes
 */
export async function interpolateFileReference(
  node: FileReferenceNode,
  env: Environment,
  context: InterpolationContext,
  interpolateFn: InterpolateFunction
): Promise<string> {
  const { FileReferenceNode } = await import('@core/types');
  
  // Special handling for <> placeholder in 'as' contexts
  if (node.meta?.isPlaceholder) {
    // Get current file from iteration context
    const currentFile = env.getCurrentIterationFile?.();
    if (!currentFile) {
      throw new Error('<> can only be used in "as" template contexts');
    }
    return processFileFields(currentFile, node.fields, node.pipes, env);
  }
  
  // Process the path (may contain variables)
  let resolvedPath: string;
  if (typeof node.source === 'string') {
    resolvedPath = node.source;
  } else if (node.source.raw) {
    resolvedPath = node.source.raw;
  } else if (node.source.segments) {
    resolvedPath = await interpolateFn(node.source.segments, env);
  } else {
    resolvedPath = await interpolateFn([node.source], env);
  }
  
  // Check if file interpolation is enabled
  if (!env.isFileInterpolationEnabled()) {
    throw new Error('File interpolation disabled by security policy');
  }
  
  // Check circular reference
  if (env.isInInterpolationStack(resolvedPath)) {
    console.error(`Warning: Circular reference detected - '${resolvedPath}' references itself, skipping`);
    return '';  // Return empty string and continue
  }
  
  // Add to stack
  env.pushInterpolationStack(resolvedPath);
  
  try {
    // Use existing content loader
    const { processContentLoader } = await import('../eval/content-loader');
    const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
    
    let loadResult: any;
    try {
      // If we already have a resolved path (from variable interpolation), create a simple path source
      const sourceToUse = resolvedPath !== node.source?.raw ? 
        { type: 'path', raw: resolvedPath, segments: [{ type: 'Text', content: resolvedPath }] } : 
        node.source;
      
      loadResult = await processContentLoader({
        type: 'load-content',
        source: sourceToUse
      }, env);
    } catch (error: any) {
      // Handle file not found or access errors gracefully by returning empty string
      if (error.code === 'ENOENT') {
        console.error(`Warning: File not found - '${resolvedPath}'`);

        // Check for failed variable interpolation
        if (resolvedPath.includes('@')) {
          const varMatches = resolvedPath.match(/@(\w+)/g);
          if (varMatches && varMatches.length > 0) {
            console.error('');
            for (const match of varMatches) {
              const varName = match.substring(1);
              try {
                const actualValue = env.getVariable(varName);
                const valueType = actualValue?.type || typeof actualValue;
                const valuePreview = JSON.stringify(actualValue, null, 2).substring(0, 200);
                console.error(`Variable @${varName} is a ${valueType} containing:`);
                console.error(valuePreview);
              } catch {
                console.error(`Variable @${varName} is not in scope or failed to retrieve.`);
              }
            }
            console.error(`\nContent loaders like <path> need a string path or array of paths.`);
            console.error(`Did you mean to use the variable directly (without angle brackets)?`);
            console.error('');
          }
        } else if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          // Check if the path looks like it might be relative
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`);
        }
        return '';
      } else if (error.code === 'EACCES') {
        console.error(`Warning: Permission denied - '${resolvedPath}'`);
        return '';
      } else {
        console.error(`Warning: Failed to load file '${resolvedPath}': ${error.message}`);

        // Check for failed variable interpolation
        if (resolvedPath.includes('@')) {
          const varMatches = resolvedPath.match(/@(\w+)/g);
          if (varMatches && varMatches.length > 0) {
            console.error('');
            for (const match of varMatches) {
              const varName = match.substring(1);
              try {
                const actualValue = env.getVariable(varName);
                const valueType = actualValue?.type || typeof actualValue;
                const valuePreview = JSON.stringify(actualValue, null, 2).substring(0, 200);
                console.error(`Variable @${varName} is a ${valueType} containing:`);
                console.error(valuePreview);
              } catch {
                console.error(`Variable @${varName} is not in scope or failed to retrieve.`);
              }
            }
            console.error(`\nContent loaders like <path> need a string path or array of paths.`);
            console.error(`Did you mean to use the variable directly (without angle brackets)?`);
            console.error('');
          }
        }

        // Check if the path looks like it might be relative
        if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`);
        }
        return '';
      }
    }
    
    // Handle glob results (array of files)
    if (isLoadContentResultArray(loadResult)) {
      // For glob patterns, join all file contents
      const contents = await Promise.all(
        loadResult.map(file => processFileFields(file, node.fields, node.pipes, env))
      );
      return contents.join('\n\n');
    }
    
    // Process field access and pipes
    return processFileFields(loadResult, node.fields, node.pipes, env);
  } finally {
    // Remove from stack
    env.popInterpolationStack(resolvedPath);
  }
}

/**
 * Process field access and pipes on file content
 */
export async function processFileFields(
  content: LoadContentResult | LoadContentResult[],
  fields: FieldAccessNode[] | undefined,
  pipes: CondensedPipe[] | undefined,
  env: Environment
): Promise<string> {
  const { isLoadContentResult } = await import('@core/types/load-content');
  let result: any = content;
  
  // Keep LoadContentResult intact for field access, only extract content if no fields to access
  if (isLoadContentResult(result)) {
    if (!fields || fields.length === 0) {
      // No field access needed, extract content
      result = result.content;
    }
    // If we have fields to access, keep the full LoadContentResult object so we can access .fm, .json, etc.
  }
  
  // Process field access
  if (fields && fields.length > 0) {
    // Use enhanced field access for better error messages
    const { accessField } = await import('../utils/field-access');
    for (const field of fields) {
      try {
        const fieldResult = await accessField(result, field, { 
          preserveContext: true,
          env 
        });
        result = (fieldResult as any).value;
        if (result === undefined) {
          // Warning to stderr
          console.error(`Warning: field '${field.value}' not found`);
          return '';
        }
      } catch (error) {
        // Field not found - log warning and return empty string for backward compatibility
        console.error(`Warning: field '${field.value}' not found`);
        return '';
      }
    }
  }
  
  // Apply pipes
  if (pipes && pipes.length > 0) {
    // Use unified pipeline processor instead of applyCondensedPipes
    const { processPipeline } = await import('../eval/pipeline/unified-processor');
    // Create a node object with the pipes for the processor
    const nodeWithPipes = { pipes };
    result = await processPipeline({
      value: result,
      env,
      node: nodeWithPipes
    });
    // Pipes already handle conversion to string format, so return as-is
    return asText(result);
  }
  
  // Convert to string only if no pipes were applied
  if (isStructuredValue(result)) {
    return asText(result);
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}
