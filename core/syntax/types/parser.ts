import { MeldNode, DirectiveNode, TextNode, CodeFenceNode, VariableNode, ErrorNode, CommentNode } from '@core/syntax/types/nodes';
import { VariableReferenceNode } from '@core/syntax/types/variables';

/**
 * Interface that all Meld parser implementations must implement
 */
export interface Parser {
  /**
   * Parse a Meld document string into an AST
   * @param input The Meld document string to parse
   * @returns Array of top-level AST nodes
   * @throws {Error} If the input is invalid or cannot be parsed
   */
  parse(input: string): MeldNode[];
}

/**
 * Result of running specification tests against an implementation
 */
export interface SpecTestResult {
  valid: boolean;
  errors: Array<{
    testName: string;
    input: string;
    expected: MeldNode;
    received?: MeldNode;
    error?: string;
  }>;
}

/**
 * Test case definition for parser implementations
 */
export interface ParserTestCase {
  name: string;
  input: string;
  expected: MeldNode | DirectiveNode | TextNode | CodeFenceNode | VariableNode | ErrorNode | CommentNode | VariableReferenceNode;
  description?: string;
} 