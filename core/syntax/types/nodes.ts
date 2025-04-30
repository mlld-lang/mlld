import { DirectiveKind } from '@core/syntax/types/directives';
import { MultiLineBlock } from '@core/syntax/types/syntax';
import { Field, VariableReferenceNode } from '@core/syntax/types/variables';
import { VariableType } from '@core/types/variables';

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

// Note: NodeType might need updating later if new node types are introduced in 'values'
export type NodeType = 'Directive' | 'Text' | 'CodeFence' | 'Variable' | 'Error' | 'Comment' | 'VariableReference' | 'Literal' | 'DotSeparator' | 'PathSeparator';

export interface MeldNode {
  type: NodeType;
  location?: SourceLocation;
  readonly nodeId: string; // Unique identifier for the node (MUST be readonly)
}

/**
 * AST node for directives
 */
export interface DirectiveNode extends MeldNode {
  type: 'Directive';
  kind: DirectiveKind; // Added: Top-level kind
  subtype?: string; // Added: Optional top-level subtype
  values: Record<string, Node[]>; // Changed: Replaced 'directive', use Node[]
  multiLine?: MultiLineBlock;
}

/**
 * AST node for text content
 */
export interface TextNode extends MeldNode {
  type: 'Text';
  content: string;
  /**
   * Optional metadata for formatting context preservation
   * Used to maintain proper formatting during transformations
   */
  formattingMetadata?: {
    /** Whether this node was created from a directive transformation */
    isFromDirective?: boolean;
    /** The original node type that created this text node */
    originalNodeType?: string;
    /** Whether to preserve exact formatting of this node */
    preserveFormatting?: boolean;
    /** Whether in output-literal mode (formerly transformation mode) */
    isOutputLiteral?: boolean;
    /** Whether this is an inline or block context */
    contextType?: 'inline' | 'block';
  };
}

/**
* AST node for literal values within directives (e.g., '*')
*/
export interface LiteralNode extends MeldNode {
  type: 'Literal';
  value: string | number | boolean; // Adjust based on expected literal types
  valueType?: string; // Optional context for the literal's role (e.g., 'import', 'variable')
}

/**
 * AST node for dot separators in paths/imports
 */
export interface DotSeparatorNode extends MeldNode {
  type: 'DotSeparator';
  value: '.';
}

/**
 * AST node for path separators (/)
 */
export interface PathSeparatorNode extends MeldNode {
    type: 'PathSeparator';
    value: '/';
}


/**
 * AST node for code fences
 */
export interface CodeFenceNode extends MeldNode {
  type: 'CodeFence';
  language?: string;
  content: string;
}

/**
 * AST node for comments
 */
export interface CommentNode extends MeldNode {
  type: 'Comment';
  content: string;  // The comment text after '>> '
}

/**
 * AST node for errors
 */
export interface ErrorNode extends MeldNode {
  type: 'Error';
  error: string;
  debugDetails?: string;  // Optional technical details shown in debug mode
  partialNode?: MeldNode;  // Optional partial AST if we can still parse some of it
}

/**
 * AST node for variables (legacy - use VariableReferenceNode instead)
 * @deprecated Use VariableReferenceNode from './variables' instead
 */
export interface VariableNode extends MeldNode {
  type: 'Variable';
  varType: VariableType;
  name: string;
  fields?: Field[];
  format?: string;
}

// Re-export the consolidated variable types
export type { Field, VariableReferenceNode };

/**
 * Type alias for interpolated content parsed from strings/templates/paths.
 * Updated to include newly added node types.
 */
export type InterpolatableValue = Array<TextNode | VariableReferenceNode | LiteralNode | DotSeparatorNode | PathSeparatorNode>;

/**
 * Structured representation of a path with segments and variable information
 * Updated to include newly added node types in 'values'.
 */
export interface StructuredPath {
  /** The original raw path string */
  raw: string;
  /** Parsed array of literal text and variable nodes representing the path */
  values: (TextNode | VariableReferenceNode | LiteralNode | DotSeparatorNode | PathSeparatorNode)[]; // Updated
  /** Whether this is a variable reference like {{var}} */
  isVariableReference?: boolean;
  /** Whether this is a path variable reference like $path_var */
  isPathVariable?: boolean;
  /** Is the path absolute (starts with /)? */
  isAbsolute: boolean;
  /** Is the path relative to the current working directory (starts with ./ or no prefix)? */
  isRelativeToCwd: boolean;
  /** Does the path contain any variables ($VAR or {{VAR}})? */
  hasVariables: boolean;
  /** Does the path contain text variables ({{VAR}})? */
  hasTextVariables: boolean;
  /** Does the path contain path variables ($VAR)? */
  hasPathVariables: boolean;
  /** Warning flag (e.g., mixed variable types) */
  variable_warning: boolean;
}

// Add LiteralNode, DotSeparatorNode, PathSeparatorNode to the union type
export type Node = DirectiveNode | TextNode | CodeFenceNode | VariableNode | ErrorNode | CommentNode | VariableReferenceNode | LiteralNode | DotSeparatorNode | PathSeparatorNode;

/**
 * AST node for variable references
 */
export interface VariableReferenceNode extends MeldNode {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  isVariableReference: true;
}

/**
 * AST node for variable definitions
 *