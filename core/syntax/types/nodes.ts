import { DirectiveKind } from './directives';
import { MultiLineBlock } from './syntax';

export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export type NodeType = 'Directive' | 'Text' | 'CodeFence' | 'Variable' | 'Error' | 'TextVar' | 'DataVar' | 'PathVar' | 'Comment' | 'VariableReference';

export interface MeldNode {
  type: NodeType;
  location?: SourceLocation;
  id?: string;  // Unique identifier for the node
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
 * Field access in a variable reference
 */
export interface Field {
  type: 'field' | 'index';
  value: string | number;
}

/**
 * AST node for variables
 */
export interface VariableNode extends MeldNode {
  type: 'Variable';
  varType: 'text' | 'data' | 'path';
  name: string;
  fields?: Field[];
  format?: string;
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
 * AST node for text variables (${identifier})
 * Supports string concatenation with the ++ operator.
 */
export interface TextVarNode extends MeldNode {
  type: 'TextVar';
  identifier: string;
  value: string;
  /**
   * For string concatenation operations, contains the individual parts being concatenated.
   * Each part can be:
   * - String literal (quoted with ', ", or `)
   * - Template literal
   * - Text variable (${text})
   * - Result of @embed directive
   * Cannot contain:
   * - Data variables (#{data})
   * - Arrays or objects
   * Example: ["Hello", "${name}", "World"] for "Hello" ++ ${name} ++ "World"
   */
  parts?: string[];
  format?: string;
  isTemplate?: boolean;
  isMultiline?: boolean;
  identifiers?: string[];  // For multiple variables in a string
  isEnv?: boolean;  // For environment variables
}

/**
 * AST node for data variables (#{identifier})
 */
export interface DataVarNode extends MeldNode {
  type: 'DataVar';
  identifier: string;
  value: string;
  fields?: Field[];  // For field access like #{data.field}
  format?: string;
}

/**
 * AST node for path variables ($identifier)
 */
export interface PathVarNode extends MeldNode {
  type: 'PathVar';
  identifier: string;
  value: string;
  isSpecial?: boolean;  // For $HOMEPATH/$~ and $PROJECTPATH/$.
}

/**
 * Structured representation of paths in the AST
 */
export interface StructuredPath {
  /** Original path string (for backward compatibility) */
  raw: string;
  /** Optional normalized form of the path (e.g. $~ -> $HOMEPATH) */
  normalized?: string;
  /** Parsed path components */
  structured: {
    /** Base path or special variable (e.g., "$HOMEPATH", ".", etc.) */
    base: string;
    /** Individual path segments */
    segments: string[];
    /** Optional metadata about variables used */
    variables?: {
      /** Text variables found (e.g., "${file}") */
      text?: string[];
      /** Path variables found (e.g., "$mypath") */
      path?: string[];
      /** Special path variables found (e.g., "$HOMEPATH", "$PROJECTPATH") */
      special?: string[];
    };
    /** Whether this is a path without slashes (in current working directory) */
    cwd?: boolean;
  };
}

/**
 * AST node for variable references
 */
export interface VariableReferenceNode extends MeldNode {
  type: 'VariableReference';
  identifier: string;
  fields?: Field[];
  isVariableReference: boolean;
}

/**
 * AST node for comments
 */
export interface CommentNode extends MeldNode {
  type: 'Comment';
  content: string;  // The comment text after '>> '
} 