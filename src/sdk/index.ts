// Export core types from meld-spec
export type { MeldNode, DirectiveNode } from 'meld-spec';

// Export core functionality
export { InterpreterState } from '../interpreter/state/state.js';
export { MeldParseError, MeldInterpretError } from '../interpreter/errors/errors.js';

// Internal imports
import { parseMeld as parseContent } from '../interpreter/parser.js';
import { interpret } from '../interpreter/interpreter.js';
import { InterpreterState } from '../interpreter/state/state.js';
import { MeldParseError, MeldInterpretError } from '../interpreter/errors/errors.js';
import { mdToLlm, mdToMarkdown } from 'md-llm';
import type { MeldNode } from 'meld-spec';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

/**
 * Options for running Meld
 */
export interface MeldOptions {
  /**
   * Output format ('llm' | 'md')
   * @default 'llm'
   */
  format?: 'llm' | 'md';
  
  /**
   * Initial state to use for interpretation
   */
  initialState?: InterpreterState;

  /**
   * Whether to include metadata in the output
   */
  includeMetadata?: boolean;
}

/**
 * Parse Meld content into an AST
 * @param content The Meld content to parse
 * @returns The parsed AST nodes
 * @throws {MeldParseError} If parsing fails
 */
export function parseMeld(content: string): MeldNode[] {
  return parseContent(content);
}

/**
 * Interpret Meld AST nodes with an optional initial state
 * @param nodes The AST nodes to interpret
 * @param initialState Optional initial interpreter state
 * @returns The final interpreter state after interpretation
 * @throws {MeldInterpretError} If interpretation fails
 */
export async function interpretMeld(
  nodes: MeldNode[],
  initialState?: InterpreterState
): Promise<InterpreterState> {
  const state = initialState || new InterpreterState();
  await interpret(nodes, state, { mode: 'toplevel' });
  return state;
}

/**
 * Convert interpreter state to the desired output format
 * @param state The interpreter state to convert
 * @param format The desired output format
 * @returns The formatted output string
 */
async function stateToOutput(state: InterpreterState, options: MeldOptions): Promise<string> {
  const nodes = state.getNodes();
  
  // Convert nodes to markdown
  const content = nodes
    .map(node => {
      if (node.type === 'Text') {
        return node.content;
      } else if (node.type === 'CodeFence') {
        return `\`\`\`${node.language || ''}\n${node.content}\n\`\`\``;
      }
      return '';
    })
    .join('\n');

  // Convert to requested format using our implementation
  return options.format === 'llm' 
    ? await mdToLlm(content, { includeMetadata: options.includeMetadata })
    : await mdToMarkdown(content, { includeMetadata: options.includeMetadata });
}

/**
 * Convenience function to read, parse, and interpret a Meld file
 * @param filePath Path to the Meld file
 * @param options Optional configuration
 * @returns The final interpreter state and formatted output
 * @throws {MeldParseError} If parsing fails
 * @throws {MeldInterpretError} If interpretation fails
 */
export async function runMeld(filePath: string, options: MeldOptions = {}): Promise<string> {
  try {
    // Validate file path
    const absolutePath = resolve(filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read and parse the content
    const content = await readFile(absolutePath, 'utf8');
    const parsedNodes = parseMeld(content);
    
    // Interpret the content
    const state = options.initialState || new InterpreterState();
    await interpret(parsedNodes, state, { mode: 'toplevel', currentPath: absolutePath });
    
    // Convert to requested format
    return stateToOutput(state, options);
  } catch (error) {
    console.error('Error running Meld:', error);
    throw error;
  }
} 