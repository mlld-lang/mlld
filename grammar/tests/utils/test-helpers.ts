/**
 * Helper utilities for grammar testing
 */
import { parse } from '@grammar/parser';
import type { DirectiveNode, MeldNode } from '@core/types';

/**
 * Parse input and return the first node, ensuring it's a directive
 */
export async function parseDirective(input: string): Promise<DirectiveNode> {
  const { ast } = await parse(input);
  
  if (ast.length !== 1) {
    throw new Error(`Expected 1 node, got ${ast.length}`);
  }
  
  const node = ast[0] as MeldNode;
  if (node.type !== 'Directive') {
    throw new Error(`Expected Directive node, got ${node.type}`);
  }
  
  return node as DirectiveNode;
}