import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createPathVariable, astLocationToSourceLocation } from '@core/types';

/**
 * Evaluate @path directives.
 * Resolves paths with special variables like @PROJECTPATH.
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
  
  // Check if this is a URL path based on the path node structure
  const pathNode = pathNodes[0]; // Assuming single path node
  const isURL = pathNode?.subtype === 'urlPath' || pathNode?.subtype === 'urlSectionPath';
  
  // Interpolate the path (resolve variables)
  const interpolatedPath = await interpolate(pathNodes, env);
  
  // Handle special path variables and absolute paths
  let resolvedPath = interpolatedPath;
  
  // For URLs, no path resolution needed
  if (isURL || env.isURL(interpolatedPath)) {
    // URLs remain as-is
    resolvedPath = interpolatedPath;
  } else {
    // Only resolve special variables and absolute paths for file paths
    if (interpolatedPath.startsWith('@PROJECTPATH') ||
        interpolatedPath.startsWith('/')) {
      resolvedPath = await env.resolvePath(interpolatedPath);
    }
    // Normalize the path (remove ./ prefix if present)
    resolvedPath = resolvedPath.replace(/^\.\//, '');
  }
  
  // Create and store the variable
  const variable = createPathVariable(identifier, {
    originalPath: interpolatedPath,
    resolvedPath: resolvedPath,
    isAbsolute: resolvedPath.startsWith('/') || isURL || env.isURL(resolvedPath),
    isRelative: !resolvedPath.startsWith('/') && !isURL && !env.isURL(resolvedPath)
  }, {
    definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  });
  
  env.setVariable(identifier, variable);
  
  // Return the resolved path
  return { value: resolvedPath, env };
}