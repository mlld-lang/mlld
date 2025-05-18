/**
 * Transformation helpers for converting parser output to typed nodes
 */

import type { MeldNode } from '@core/ast/types';
import type { MeldNode as OldMeldNode } from '@core/syntax/types';
import { MeldParseError } from '@core/errors/MeldParseError';
import { parserLogger as logger } from '@core/utils/logger';

/**
 * Validates that a node has the required fields for the new MeldNode type
 */
function isValidMeldNode(node: any): node is MeldNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof node.type === 'string' &&
    typeof node.nodeId === 'string'
  );
}

/**
 * Transforms raw parser output nodes to the new MeldNode union type
 * 
 * @param rawNodes - The raw nodes from the parser
 * @returns Array of typed MeldNode instances
 * @throws MeldParseError if any node is invalid
 */
export function transformParsedNodes(rawNodes: OldMeldNode[]): MeldNode[] {
  logger.debug('Transforming parsed nodes', { count: rawNodes.length });
  
  const transformedNodes: MeldNode[] = [];
  
  for (const node of rawNodes) {
    // Validate that the node has required fields
    if (!isValidMeldNode(node)) {
      const location = node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
      throw new MeldParseError(
        `Invalid AST node: missing required fields (type: ${node.type}, nodeId: ${(node as any).nodeId})`,
        location,
        {
          cause: new Error('Node validation failed'),
          context: {
            node,
            missingType: typeof node.type !== 'string',
            missingNodeId: typeof (node as any).nodeId !== 'string'
          }
        }
      );
    }
    
    // The parser output already matches our union structure,
    // so we can cast it directly after validation
    transformedNodes.push(node as MeldNode);
  }
  
  logger.debug('Successfully transformed nodes', { count: transformedNodes.length });
  return transformedNodes;
}

/**
 * Creates transformation options for the parser
 */
export function createParserOptions(filePath?: string) {
  return {
    failFast: true,
    trackLocations: true,
    validateNodes: true,
    preserveCodeFences: true,
    validateCodeFences: true,
    structuredPaths: true,
    filePath,
    onError: (error: unknown) => {
      logger.warn('Parse warning', { error });
    }
  };
}