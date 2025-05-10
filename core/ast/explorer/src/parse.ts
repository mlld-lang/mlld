/**
 * Parser adapter for the Meld grammar
 */
import * as fs from 'fs';
import { parse as meldParse } from '@core/ast/grammar/parser';
import type { DirectiveNode } from '@grammar/types/base';
import type { MeldNode } from '@core/syntax/types/nodes';
import { extractDirectives } from './extract-directives';

// Enable mock AST for tests automatically
process.env.MOCK_AST = process.env.NODE_ENV === 'test' ? 'true' : process.env.MOCK_AST;

/**
 * Parse a directive string and return the AST
 */
export function parseDirective(directive: string): DirectiveNode {
  // For testing or development, use a mock AST
  if (process.env.MOCK_AST === 'true') {
    console.log(`Would parse directive: ${directive.substring(0, 30)}...`);
    return createMockAst(directive);
  }

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
    
    // Extract individual directives using our enhanced extractor
    const directives = extractDirectives(content);
    
    // Parse each directive
    return directives.map(directive => {
      try {
        return parseDirective(directive);
      } catch (error) {
        console.warn(`Failed to parse directive: ${directive.substring(0, 30)}...`);
        throw error;
      }
    });
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

/**
 * Create a mock AST for development and testing
 * This is used when the real parser is not available
 */
function createMockAst(directive: string): DirectiveNode {
  // Extract directive kind from the string
  const match = directive.match(/@(\w+)\s+/);
  const kind = match ? match[1] : 'unknown';
  
  // Determine subtype based on content pattern
  let subtype = 'unknown';
  
  if (kind === 'text') {
    if (directive.includes('=')) {
      subtype = 'textAssignment';
    } else {
      subtype = 'textTemplate';
    }
  } else if (kind === 'run') {
    if (directive.includes('```')) {
      subtype = 'runCode';
    } else {
      subtype = 'runCommand';
    }
  } else if (kind === 'import') {
    subtype = 'importSelected';
  } else if (kind === 'data') {
    subtype = 'dataObject';
  } else if (kind === 'add') {
    subtype = 'addTemplate';
  }
  
  // Extract identifier and content when available
  const identifierMatch = directive.match(/\s+(\w+)\s*=/);
  const identifier = identifierMatch ? identifierMatch[1] : '';
  
  const contentMatch = directive.match(/=\s*(.+?)(\s*$|\s*@)/);
  const content = contentMatch ? contentMatch[1].trim() : '';
  
  // Create a standard mock AST node for testing
  const mockAst: DirectiveNode = {
    type: 'Directive',
    kind,
    subtype,
    values: {
      identifier: identifier ? [{ type: 'string', value: identifier }] : [],
      content: content ? [{ type: 'string', value: content }] : []
    },
    raw: {
      identifier,
      content
    },
    meta: {
      sourceType: 'literal'
    }
  };
  
  return mockAst;
}