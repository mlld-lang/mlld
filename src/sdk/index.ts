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
import { interpreterLogger } from '../utils/logger';

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
  interpreterLogger.debug('Parsing Meld content', {
    contentLength: content.length
  });
  
  try {
    const nodes = parseContent(content);
    interpreterLogger.debug('Successfully parsed Meld content', {
      nodeCount: nodes.length,
      nodeTypes: nodes.map(n => n.type)
    });
    return nodes;
  } catch (error) {
    interpreterLogger.error('Failed to parse Meld content', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
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
  interpreterLogger.debug('Starting Meld interpretation', {
    nodeCount: nodes.length,
    hasInitialState: !!initialState
  });

  try {
    const state = initialState || new InterpreterState();
    await interpret(nodes, state, { mode: 'toplevel' });
    
    interpreterLogger.debug('Successfully interpreted Meld content', {
      finalNodeCount: state.getNodes().length,
      changes: Array.from(state.getLocalChanges())
    });
    
    return state;
  } catch (error) {
    interpreterLogger.error('Failed to interpret Meld content', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Convert interpreter state to the desired output format
 * @param state The interpreter state to convert
 * @param format The desired output format
 * @returns The formatted output string
 */
async function stateToOutput(state: InterpreterState, options: MeldOptions): Promise<string> {
  interpreterLogger.debug('Converting state to output', {
    format: options.format || 'llm',
    includeMetadata: options.includeMetadata,
    nodeCount: state.getNodes().length
  });

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

  try {
    // Convert to requested format using our implementation
    const output = options.format === 'llm' 
      ? await mdToLlm(content, { includeMetadata: options.includeMetadata })
      : await mdToMarkdown(content, { includeMetadata: options.includeMetadata });

    interpreterLogger.debug('Successfully converted state to output', {
      format: options.format || 'llm',
      outputLength: output.length
    });

    return output;
  } catch (error) {
    interpreterLogger.error('Failed to convert state to output', {
      format: options.format || 'llm',
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
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
  interpreterLogger.info('Running Meld file', {
    filePath,
    format: options.format || 'llm',
    hasInitialState: !!options.initialState
  });

  try {
    // Resolve and validate file path
    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      interpreterLogger.error('Meld file not found', { filePath: resolvedPath });
      throw new Error(`File not found: ${resolvedPath}`);
    }

    // Read file content
    const content = await readFile(resolvedPath, 'utf-8');
    interpreterLogger.debug('Read Meld file', {
      filePath: resolvedPath,
      contentLength: content.length
    });

    // Parse content
    const nodes = parseMeld(content);

    // Interpret nodes
    const state = await interpretMeld(nodes, options.initialState);

    // Convert to output format
    const output = await stateToOutput(state, options);

    interpreterLogger.info('Successfully ran Meld file', {
      filePath: resolvedPath,
      outputLength: output.length
    });

    return output;
  } catch (error) {
    interpreterLogger.error('Failed to run Meld file', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
} 