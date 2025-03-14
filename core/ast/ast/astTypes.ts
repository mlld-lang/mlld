import type {
  MeldNode,
  NodeType,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  TextVarNode,
  DataVarNode,
  PathVarNode,
  CommentNode,
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
  Example
} from '@core/syntax/types';

// Re-export all imported types
export type {
  MeldNode,
  NodeType,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  TextVarNode,
  DataVarNode,
  PathVarNode,
  CommentNode,
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