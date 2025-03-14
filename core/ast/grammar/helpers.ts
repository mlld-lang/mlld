import type { MeldNode } from '@core/syntax/types.js';
import type {
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  TextVarNode,
  DataVarNode,
  PathVarNode,
  CommentNode,
  NodeType,
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  CommandDefinition,
  CommandMetadata,
  RiskLevel,
  Parser,
  ParserTestCase,
  ValidationError,
  ValidationContext,
  ValidationResult,
  Example,
  VariableReferenceNode
} from '@core/syntax/types.js';

/**
 * Creates a new AST node that conforms to the meld-spec type definitions.
 * 
 * @param type - The type of node to create, must be a valid NodeType from meld-spec
 * @param data - Additional data to include in the node (e.g., content, directive info)
 * @param location - Source location information from the parser
 * @returns A properly structured MeldNode with location information
 * 
 * @example
 * ```typescript
 * const node = createNode('Text', { content: 'Hello' }, location());
 * ```
 */
export function createNode(type: NodeType, data: Record<string, any>, location: any): MeldNode {
  return {
    type,
    ...data,
    location: {
      start: { line: location.startLine, column: location.startColumn },
      end: { line: location.endLine, column: location.endColumn }
    }
  };
}

/**
 * Extracts location information from a Peggy parser location function.
 * Converts Peggy's location format to meld-spec's SourceLocation format.
 * 
 * @param location - Function that returns Peggy location information
 * @returns A SourceLocation object conforming to meld-spec
 * 
 * @example
 * ```typescript
 * const loc = getLocation(() => parser.location());
 * ```
 */
export function getLocation(location: () => any): SourceLocation {
  const loc = location();
  return {
    start: { line: loc.startLine, column: loc.startColumn },
    end: { line: loc.endLine, column: loc.endColumn }
  };
}

/**
 * Joins an array of text parts into a single string.
 * Used primarily for concatenating text nodes in the parser.
 * 
 * @param parts - Array of text strings to join
 * @returns The concatenated text
 * 
 * @example
 * ```typescript
 * const text = textJoin(['Hello', ' ', 'world']);
 * // Returns: 'Hello world'
 * ```
 */
export function textJoin(parts: string[]): string {
  return parts.join('');
}