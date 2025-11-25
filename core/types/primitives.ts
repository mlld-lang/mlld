/**
 * Primitive node types for the Mlld AST
 * These are the fundamental building blocks used by directive types
 */

import type { WithClause } from './run';

// Position and source location tracking
export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

// Base interface for all nodes
export interface BaseMlldNode {
  type: string;
  nodeId: string;
  location?: SourceLocation;
}

// Text content node - represents plain text
export interface TextNode extends BaseMlldNode {
  type: 'Text';
  content: string;
  formattingMetadata?: FormattingMetadata;
}

// Field access node - represents a single field/array access in a chain
export interface FieldAccessNode {
  type: 'field' | 'numericField' | 'arrayIndex' | 'stringIndex' | 'bracketAccess' | 'variableIndex' | 'arraySlice' | 'arrayFilter';
  value?: string | number;  // The field name or index value (optional for slice/filter)
  // 'field': .name (value is string)
  // 'numericField': .123 (value is number) 
  // 'arrayIndex': [123] (value is number)
  // 'stringIndex': ["key"] (value is string)
  // 'bracketAccess': ["key"] (value is string)
  // 'variableIndex': [@var] (value is string)
  // 'arraySlice': [start:end] (see start/end fields)
  // 'arrayFilter': [?condition] (see condition field)
  
  // Operation-specific fields for slice operations
  start?: number | null;  // null means from beginning
  end?: number | null;    // null means to end
  
  // Operation-specific fields for filter operations
  condition?: FilterCondition;
  
  location?: SourceLocation;
}

// Array slice node - specific type for array slicing
export interface ArraySliceNode extends FieldAccessNode {
  type: 'arraySlice';
  start: number | null;
  end: number | null;
}

// Array filter node - specific type for array filtering
export interface ArrayFilterNode extends FieldAccessNode {
  type: 'arrayFilter';
  condition: FilterCondition;
}

// Filter condition for array filtering
export interface FilterCondition {
  field: string | string[];  // String array for nested fields (e.g., ['fm', 'draft'])
  operator?: '==' | '!=' | '>' | '>=' | '<' | '<=' | '~';  // '~' for string contains
  value?: any;  // Comparison value, TimeDuration, or VariableReference
}

// Time duration node for relative time comparisons
export interface TimeDurationNode extends BaseMlldNode {
  type: 'TimeDuration';
  value: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'years';
}

// Variable reference node
export interface VariableReferenceNode extends BaseMlldNode {
  type: 'VariableReference';
  identifier: string;
  valueType: string;
  fields?: FieldAccessNode[]; // Flat array of field accesses
  format?: string;
  pipes?: CondensedPipe[]; // NEW: Condensed pipe transformations
}

// Literal value node
export interface LiteralNode extends BaseMlldNode {
  type: 'Literal';
  value: string | number | boolean | null;
  valueType?: string;
}

// Separator nodes
export interface DotSeparatorNode extends BaseMlldNode {
  type: 'DotSeparator';
  value: '.';
}

export interface PathSeparatorNode extends BaseMlldNode {
  type: 'PathSeparator';
  value: '/';
}

// Code fence node for code blocks
export interface CodeFenceNode extends BaseMlldNode {
  type: 'CodeFence';
  language?: string;
  content: string;
}

// MlldRunBlock node for interpreted code blocks
export interface MlldRunBlockNode extends BaseMlldNode {
  type: 'MlldRunBlock';
  content: MlldNode[];
  raw: string;
  error?: string;
}

// Comment node
export interface CommentNode extends BaseMlldNode {
  type: 'Comment';
  content: string;
}

// Error node for parse errors
export interface ErrorNode extends BaseMlldNode {
  type: 'Error';
  error: string;
  debugDetails?: unknown;
  partialNode?: unknown;
}

// Frontmatter node
export interface FrontmatterNode extends BaseMlldNode {
  type: 'Frontmatter';
  content: string;
  data?: unknown; // Parsed YAML
}

// Newline node
export interface NewlineNode extends BaseMlldNode {
  type: 'Newline';
  content: string;
}

// Section marker node
export interface SectionMarkerNode extends BaseMlldNode {
  type: 'SectionMarker';
  value: string;
}

// Parameter node for exec directive parameters
export interface ParameterNode extends BaseMlldNode {
  type: 'Parameter';
  name: string;
}

// Template for-block node used inside template interpolation contexts
export interface TemplateForBlockNode extends BaseMlldNode {
  type: 'TemplateForBlock';
  variable: VariableReferenceNode;
  source: BaseMlldNode[];
  body: BaseMlldNode[];
  style: 'slash' | 'mustache';
}

// Inline /show node used inside template interpolation contexts
export interface TemplateInlineShowNode extends BaseMlldNode {
  type: 'TemplateInlineShow';
  showKind: 'command' | 'code' | 'template' | 'load' | 'reference';
  // Payloads for different kinds
  content?: any;           // UnifiedCommandBrackets result for command
  lang?: BaseMlldNode[];   // Language for code
  code?: BaseMlldNode[];   // Code nodes for code
  template?: BaseMlldNode; // TemplateCore node for template variant
  loadContent?: BaseMlldNode; // AlligatorExpression node
  reference?: BaseMlldNode;   // UnifiedReferenceWithTail node
  tail?: any | null;       // Optional TailModifiers
  meta?: { [key: string]: unknown };
}


// Formatting metadata for text nodes
export interface FormattingMetadata {
  trimLines?: boolean;
  trimInline?: boolean;
  removeEmptyLines?: boolean;
  preserveLineBreaks?: boolean;
  indentationLevel?: number;
  language?: string;
}

// Directive types
export type DirectiveKind =
  | 'run'
  | 'import'
  | 'export'
  | 'var'
  | 'show'
  | 'exe'
  | 'path'
  | 'output'
  | 'append'
  | 'when'
  | 'guard'
  | 'stream';

export type DirectiveSubtype =
  // Import subtypes
  | 'importAll' | 'importSelected' | 'importNamespace'
  // Export subtype
  | 'exportSelected'
  // Unified var subtype
  | 'var'
  // Unified show subtypes
  | 'show' | 'showInvocation' | 'showPath' | 'showVariable' | 'showTemplate'
  // Unified exe subtype
  | 'exe'
  // Path subtypes
  | 'pathAssignment'
  // Run subtypes
  | 'runCommand' | 'runExec' | 'runCode'
  // Output subtypes
  | 'outputResolver' | 'outputFile' | 'outputCommand'
  // Append subtypes
  | 'appendFile'
  // When subtypes
  | 'whenSimple' | 'whenBlock' | 'whenMatch'
  // Guard subtype
  | 'guard';

export type DirectiveSource = 'path' | 'variable' | 'template' | 'literal' | 'embed' | 'run' | 'directive';

// Directive base node
export interface DirectiveNode extends BaseMlldNode {
  type: 'Directive';
  kind: DirectiveKind;
  subtype: DirectiveSubtype;
  source?: DirectiveSource;
  values: { [key: string]: BaseMlldNode[] };
  raw: { [key: string]: string };
  meta: { [key: string]: unknown };
}

// Module reference types
export interface ModuleReference {
  namespace: string;
  path?: string[];
  name: string;
  hash?: string;
}

// Command reference node for exec invocations
export interface CommandReference extends BaseMlldNode {
  type: 'CommandReference';
  identifier: string;
  args?: VariableReferenceNode[];
  fields?: Array<{ type: 'field' | 'index'; value: string | number }>;
}

// Exec invocation node - represents exec-defined command invocations with tail modifiers
export interface ExecInvocation extends BaseMlldNode {
  type: 'ExecInvocation';
  commandRef: CommandReference;
  withClause?: WithClause;
}

// Negation node - represents negation of a condition (!) in @when directives
export interface NegationNode extends BaseMlldNode {
  type: 'Negation';
  condition: BaseMlldNode[];  // The condition being negated
}

// Condensed pipe transformation
export interface CondensedPipe {
  name: string;
  args?: any[];
}

// File reference node - represents <file.md> interpolation
export interface FileReferenceNode extends BaseMlldNode {
  type: 'FileReference';
  source: any; // AlligatorPath or placeholder
  fields?: FieldAccessNode[]; // Field access chain
  pipes?: CondensedPipe[]; // Pipe transformations
  meta?: {
    isFileReference: boolean;
    hasGlob?: boolean;
    isPlaceholder?: boolean; // For <> in 'as' contexts
  };
}

// Expression nodes for logical operators
export interface BinaryExpression extends BaseMlldNode {
  type: 'BinaryExpression';
  operator: '&&' | '||' | '==' | '!=' | '<' | '>' | '<=' | '>=';
  left: Expression;
  right: Expression;
}

export interface TernaryExpression extends BaseMlldNode {
  type: 'TernaryExpression';
  condition: Expression;
  trueBranch: Expression;
  falseBranch: Expression;
}

export interface UnaryExpression extends BaseMlldNode {
  type: 'UnaryExpression';
  operator: '!';
  operand: Expression;
}

// Union type for all expression nodes
export type Expression = 
  | BinaryExpression 
  | TernaryExpression 
  | UnaryExpression 
  | VariableReferenceNode 
  | LiteralNode 
  | ExecInvocation
  | NegationNode;
