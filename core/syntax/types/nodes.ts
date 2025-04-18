import { DirectiveKind } from '@core/syntax/types/directives.js';
import { MultiLineBlock } from '@core/syntax/types/syntax.js';
import { VariableType, Field, VariableReferenceNode } from '@core/syntax/types/variables.js';

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
export type { VariableType, Field, VariableReferenceNode };

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
  /** Parsed structure of the path */
  structured: {
    /** Path segments split by separators */
    segments: string[];
    /** Variables found in the path */
    variables?: {
      /** Special variables like $PROJECTPATH, $HOMEPATH */
      special?: string[];
      /** Path variables defined with @path directives */
      path?: string[];
      /** Text variables {{var}} */
      text?: string[];
    };
    /** Whether the path is relative to current working directory */
    cwd?: boolean;
    /** Whether the path is a URL */
    url?: boolean;
    /** Path base (for special paths) */
    base?: string;
  };
  /** Path in normalized form (typically absolute) */
  normalized?: string;
  /** Whether this is a variable reference like {{var}} */
  isVariableReference?: boolean;
  /** Whether this is a path variable reference like $path_var */
  isPathVariable?: boolean;
  /** Parsed nodes if path came from brackets/quotes (as per AST-VARIABLES.md) */
  interpolatedValue?: InterpolatableValue;
} 