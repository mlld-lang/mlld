import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createPathVariable, astLocationToSourceLocation } from '@core/types';
import type { SecurityOptions } from '@core/types/primitives';

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
    identifier = (identifierNode as any).identifier;
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
  
  // Extract security options from the directive values (TTL) and withClause (trust)
  const security: SecurityOptions | undefined = (directive.values?.ttl || directive.values?.withClause?.trust) ? {
    ttl: directive.values?.ttl,
    trust: directive.values?.withClause?.trust
  } : undefined;
  
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
  
  // Create and store the variable with security metadata
  const variable = createPathVariable(identifier, resolvedPath, {
    isURL: isURL || env.isURL(resolvedPath),
    security: security
  }, {
    definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  });
  
  // Convert to Environment's MlldVariable format with TTL/trust metadata
  const mlldVar: any = {
    type: 'path',
    value: variable.value,
    nodeId: directive.nodeId || '',
    location: directive.location || { line: 0, column: 0 },
    metadata: {
      ...variable.metadata,
      // Add TTL/trust from security options
      ...(security?.ttl && { ttl: security.ttl }),
      ...(security?.trust && { trust: security.trust }),
      // Store the configured by info
      configuredBy: identifier
    }
  };
  
  env.setVariable(identifier, mlldVar);
  
  // Return the resolved path
  return { value: resolvedPath, env };
}