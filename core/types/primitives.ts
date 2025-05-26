/**
 * Primitive node types for the Mlld AST
 * These are the fundamental building blocks used by directive types
 */

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

// Variable reference node
export interface VariableReferenceNode extends BaseMlldNode {
  type: 'VariableReference';
  identifier: string;
  valueType: string;
  fields?: Array<{ type: 'field' | 'index'; value: string | number }>;
  format?: string;
}

// Literal value node
export interface LiteralNode extends BaseMlldNode {
  type: 'Literal';
  value: any;
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

// Comment node
export interface CommentNode extends BaseMlldNode {
  type: 'Comment';
  content: string;
}

// Error node for parse errors
export interface ErrorNode extends BaseMlldNode {
  type: 'Error';
  error: string;
  debugDetails?: any;
  partialNode?: any;
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
  | 'add'
  | 'exec'
  | 'text'
  | 'path'
  | 'data';

export type DirectiveSubtype = 
  | 'importAll' | 'importSelected'
  | 'addPath' | 'addVariable' | 'addTemplate' | 'addPathSection' | 'addTemplateInvocation'
  | 'textAssignment' | 'textTemplate' | 'textPath' | 'textPathSection' | 'textTemplateDefinition'
  | 'dataAssignment'
  | 'pathAssignment'
  | 'runCommand' | 'runExec' | 'runCode'
  | 'execCode' | 'execCommand';

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