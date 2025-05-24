import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createPathVariable } from '@core/types';

/**
 * Evaluate @path directives.
 * Resolves paths with special variables like $HOMEPATH, $PROJECTPATH.
 * 
 * Ported from PathDirectiveHandler.
 */
export async function evaluatePath(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Path directive missing identifier');
  }
  
  // Extract path nodes
  const pathNodes = directive.values?.path;
  if (!pathNodes) {
    throw new Error('Path directive missing path');
  }
  
  // Interpolate the path (resolve variables)
  const interpolatedPath = await interpolate(pathNodes, env);
  
  // Handle special path variables and absolute paths
  let resolvedPath = interpolatedPath;
  
  // Only resolve special variables and absolute paths
  if (interpolatedPath.startsWith('$HOMEPATH') || 
      interpolatedPath.startsWith('$PROJECTPATH') ||
      interpolatedPath.startsWith('/')) {
    resolvedPath = await env.resolvePath(interpolatedPath);
  }
  
  // Normalize the path (remove ./ prefix if present)
  const normalizedPath = resolvedPath.replace(/^\.\//, '');
  
  // Create and store the variable
  const variable = createPathVariable(identifier, {
    originalPath: interpolatedPath,
    resolvedPath: normalizedPath,
    isAbsolute: normalizedPath.startsWith('/'),
    isRelative: !normalizedPath.startsWith('/')
  });
  
  env.setVariable(identifier, variable);
  
  // Return the resolved path
  return { value: normalizedPath, env };
}