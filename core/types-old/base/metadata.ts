export interface VariableMetadata {
  /** When the variable was created */
  createdAt?: Date;
  /** When the variable was last modified */
  updatedAt?: Date;
  /** Source file or directive that created this variable */
  origin?: string;
  /** Whether this variable is exported or local */
  exported?: boolean;
  /** Documentation or comments about this variable */
  documentation?: string;
}

export interface VariableChange {
  /** What changed */
  field: string;
  /** Previous value */
  oldValue: any;
  /** New value */
  newValue: any;
  /** When the change occurred */
  timestamp: Date;
  /** What caused the change */
  source: string;
}

export interface VariableOrigin {
  /** Full path to the file where this variable was defined */
  filePath: string;
  /** Line number where the variable was defined */
  line: number;
  /** Column number where the variable was defined */
  column: number;
  /** The directive type that created this variable */
  directiveType: string;
}

export interface NodeMetadata {
  /** Whether this node was created from a directive transformation */
  isFromDirective?: boolean;
  /** The original node type that created this node */
  originalNodeType?: string;
  /** Whether to preserve exact formatting of this node */
  preserveFormatting?: boolean;
  /** Whether in output-literal mode (formerly transformation mode) */
  isOutputLiteral?: boolean;
  /** Whether this is an inline or block context */
  contextType?: 'inline' | 'block';
  [key: string]: unknown;
}