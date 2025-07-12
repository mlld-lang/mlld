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
  type: 'field' | 'numericField' | 'arrayIndex' | 'stringIndex';
  value: string | number;  // The field name or index value
  // 'field': .name (value is string)
  // 'numericField': .123 (value is number) 
  // 'arrayIndex': [123] (value is number)
  // 'stringIndex': ["key"] (value is string)
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
  | 'var'
  | 'show'
  | 'exe'
  | 'path'
  | 'output'
  | 'when';

export type DirectiveSubtype = 
  // Import subtypes
  | 'importAll' | 'importSelected'
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
  // When subtypes
  | 'whenSimple' | 'whenBlock' | 'whenSwitch';

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

// Security-related types
export interface SecurityOptions {
  ttl?: TTLOption;
  trust?: TrustLevel;
}

export interface TTLOption {
  type: 'duration' | 'special';
  value?: number;
  unit?: string;
  seconds?: number;
}

// TTLValue is an alias for TTLOption for consistency with grammar
export type TTLValue = TTLOption;

export type TrustLevel = 'always' | 'verify' | 'never';

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