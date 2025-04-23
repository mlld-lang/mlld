import type {
  MeldNode,
  NodeType,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  CommentNode,
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  VariableReferenceNode,
  CommandDefinition,
  CommandMetadata,
  RiskLevel,
  Parser,
  ParserTestCase,
  ValidationError,
  ValidationContext,
  ValidationResult,
  Example
} from '@core/syntax/types';
import type { TextNode as TextNodeImport, CodeFenceNode as CodeFenceNodeImport, CommentNode as CommentNodeImport, ErrorNode as ErrorNodeImport, VariableReferenceNode as VariableReferenceNodeImport } from '@core/syntax/types/nodes';
import type { SourceLocation as SourceLocationImport } from '@core/syntax/types/shared-types';
// Correct import path for DirectiveData
import type { DirectiveData as DirectiveDataImport } from '@core/syntax/types/index';

// Re-export all imported types
export type {
  MeldNode,
  NodeType,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  CommentNode,
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  VariableReferenceNode,
  CommandDefinition,
  CommandMetadata,
  RiskLevel,
  Parser,
  ParserTestCase,
  ValidationError,
  ValidationContext,
  ValidationResult
};

// New types for array access
export interface FieldAccessElement {
  type: 'field';
  value: string;
}

export interface ArrayAccessElement {
  type: 'index';
  value: string | number;
}

export type AccessElement = FieldAccessElement | ArrayAccessElement; 