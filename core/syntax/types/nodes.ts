import { DirectiveKind } from '@core/syntax/types/directives';
import { MultiLineBlock } from '@core/syntax/types/syntax';
import { Field, VariableReferenceNode } from '@core/syntax/types/variables';
import { VariableType } from '@core/types/variables';

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export type NodeType = 'Directive' | 'Text' | 'CodeFence' | 'Variable' | 'Error' | 'Comment' | 'VariableReference';

export interface MeldNode {
  type: NodeType;
  location?: SourceLocation;
  readonly nodeId: string; // Unique identifier for the node (MUST be readonly)
}

/**
 * Base interface for directive data in AST nodes
 */
export interface DirectiveData {
  kind: DirectiveKind;
  [key: string]: any;
}

/**
 * AST node for directives
 */
export interface DirectiveNode<T extends DirectiveData = DirectiveData> extends MeldNode {
  type: 'Directive';
  directive: T;
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
 */
export type InterpolatableValue = Array<TextNode | VariableReferenceNode>;

/**
 * Structured representation of a path with segments and variable information
 */
export interface StructuredPath {
  /** The original raw path string */
  raw: string;
  /** Parsed array of literal text and variable nodes representing the path */
  values: (TextNode | VariableReferenceNode)[];
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

/**
 * AST node for variable references
 */