/**
 * Parser adapter for the Meld grammar
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse as meldParse } from '@core/ast/grammar/parser';
import type { DirectiveNode } from '@grammar/types/base';
import type { MeldNode } from '@core/syntax/types/nodes';

/**
 * Parse a directive string and return the AST
 */
export function parseDirective(directive: string): DirectiveNode {
  try {
    // Parse the string using the Meld parser
    const result = meldParse(directive);
    
    // The result should be an array with at least one node
    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('Parser returned no nodes');
    }
    
    // Get the first node, which should be the directive
    const node = result[0] as MeldNode;
    
    // Check if it's a directive node
    if (node.type !== 'Directive') {
      throw new Error(`Expected a Directive node, but got ${node.type}`);
    }
    
    // Return the directive node
    return node as DirectiveNode;
  } catch (error: any) {
    // Handle parsing errors
    throw new Error(`Failed to parse directive: ${error.message}`);
  }
}

/**
 * Parse a file containing one or more directives
 */
export function parseFile(filePath: string): DirectiveNode[] {
  try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse the content using the Meld parser
    const result = meldParse(content);
    
    // Check if the result is an array
    if (!result || !Array.isArray(result)) {
      throw new Error('Parser returned invalid result');
    }
    
    // Filter for directive nodes
    const directives = result.filter(node => node.type === 'Directive') as DirectiveNode[];
    
    return directives;
  } catch (error: any) {
    // Handle parsing errors
    throw new Error(`Failed to parse file ${filePath}: ${error.message}`);
  }
}

/**
 * Interface for normalized node structure
 * This provides a consistent interface for analyzing nodes
 */
export interface NormalizedNode {
  kind: string;
  subtype: string;
  values: Record<string, any>;
  raw: Record<string, string>;
  meta: Record<string, any>;
}

/**
 * Convert a directive node to a normalized structure for analysis
 * This helps abstract away parser implementation details
 */
export function normalizeNode(node: DirectiveNode): NormalizedNode {
  return {
    kind: node.kind,
    subtype: node.subtype,
    values: Object.fromEntries(
      Object.entries(node.values || {}).map(([key, value]) => [key, value])
    ),
    raw: { ...node.raw },
    meta: { ...node.meta }
  };
}