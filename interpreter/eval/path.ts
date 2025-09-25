import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { astLocationToSourceLocation } from '@core/types';
import { createPathVariable, type VariableSource } from '@core/types/variable';

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
  // Extract identifier - this is a variable name, not content to interpolate
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Path directive missing identifier');
  }
  
  // For path directives, extract the variable name
  const identifierNode = identifierNodes[0];
  let identifier: string;
  
  if (identifierNode.type === 'Text' && 'content' in identifierNode) {
    // eslint-disable-next-line mlld/no-ast-string-manipulation
    identifier = (identifierNode as TextNode).content;
  } else if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = (identifierNode as any).identifier as string;
  } else {
    throw new Error('Path directive identifier must be a simple variable name');
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
  
  // Check if this is a resolver reference first
  const resolverManager = env.getResolverManager();
  if (resolverManager && interpolatedPath.startsWith('@')) {
    // Extract potential resolver name from the path
    const pathParts = interpolatedPath.substring(1).split('/');
    const potentialResolver = pathParts[0];
    
    if (resolverManager.isResolverName(potentialResolver)) {
      // This is a resolver reference - try to resolve it
      try {
        const resolverContent = await env.resolveModule(interpolatedPath, 'path');
        
        // Validate content type for paths - reject modules
        if (resolverContent.contentType === 'module') {
          throw new Error(
            `Cannot use module as path: ${interpolatedPath} (modules must be imported, not used as paths)`
          );
        }
        
        // For text/data content, use the content as the path value
        resolvedPath = resolverContent.content;
      } catch (error) {
        // If it's a module content type error, re-throw it
        if (error.message?.includes('Cannot use module as path')) {
          throw error;
        }
        // For other errors, fall back to normal path resolution
        resolvedPath = await env.resolvePath(interpolatedPath);
      }
    } else {
      // Not a resolver, use normal path resolution
      resolvedPath = await env.resolvePath(interpolatedPath);
    }
  } else if (isURL || env.isURL(interpolatedPath)) {
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
  
  // Create variable source metadata
  const source: VariableSource = {
    directive: 'var', // Path directives create variables in the new system
    syntax: 'path',
    hasInterpolation: false,
    isMultiLine: false
  };
  
  // Create and store the variable with security metadata
  const location = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());
  const variable = createPathVariable(
    identifier,
    resolvedPath,
    interpolatedPath, // Original path before resolution
    isURL || env.isURL(resolvedPath),
    resolvedPath.startsWith('/'), // Is absolute
    source,
    undefined,
    { definedAt: location }
  );
  
  env.setVariable(identifier, variable);
  
  // Return the resolved path
  return { value: resolvedPath, env };
}
