// Export core types from meld-spec
export type { MeldNode, DirectiveNode } from 'meld-spec';

// Export core functionality
export { InterpreterState } from '../interpreter/state/state.js';
export { MeldParseError, MeldInterpretError } from '../interpreter/errors/errors.js';

// Internal imports
import { parseMeldContent } from '../interpreter/parser.js';
import { interpret } from '../interpreter/interpreter.js';
import { InterpreterState } from '../interpreter/state/state.js';
import { MeldParseError, MeldInterpretError } from '../interpreter/errors/errors.js';
import { mdToLlm, mdToMarkdown } from '../../tests/__mocks__/md-llm.js';
import type { MeldNode } from 'meld-spec';
import { promises as fs } from 'fs';
import { resolve } from 'path';

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
}

/**
 * Parse Meld content into an AST
 * @param content The Meld content to parse
 * @returns The parsed AST nodes
 * @throws {MeldParseError} If parsing fails
 */
export function parseMeld(content: string): MeldNode[] {
  return parseMeldContent(content);
}

/**
 * Interpret Meld AST nodes with an optional initial state
 * @param nodes The AST nodes to interpret
 * @param initialState Optional initial interpreter state
 * @returns The final interpreter state after interpretation
 * @throws {MeldInterpretError} If interpretation fails
 */
export function interpretMeld(nodes: MeldNode[], initialState?: InterpreterState): InterpreterState {
  const state = initialState ?? new InterpreterState();
  interpret(nodes, state);
  return state;
}

/**
 * Convert interpreter state to the desired output format
 * @param state The interpreter state to convert
 * @param format The desired output format
 * @returns The formatted output string
 */
async function stateToOutput(state: InterpreterState, format: 'llm' | 'md'): Promise<string> {
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

  // Convert to requested format using md-llm
  return format === 'llm' ? await mdToLlm(content) : await mdToMarkdown(content);
}

/**
 * Convenience function to read, parse, and interpret a Meld file
 * @param filePath Path to the Meld file
 * @param options Optional configuration
 * @returns The final interpreter state and formatted output
 * @throws {MeldParseError} If parsing fails
 * @throws {MeldInterpretError} If interpretation fails
 */
export async function runMeld(filePath: string, options: MeldOptions = {}): Promise<{ state: InterpreterState; output: string }> {
  const { format = 'llm', initialState } = options;
  
  // Read and parse the file
  const absolutePath = resolve(filePath);
  const content = await fs.readFile(absolutePath, 'utf8');
  const nodes = parseMeld(content);
  
  // Interpret the content
  const state = interpretMeld(nodes, initialState);
  
  // Convert to requested format
  const output = await stateToOutput(state, format);
  
  return { state, output };
} 