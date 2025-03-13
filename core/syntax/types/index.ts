// Import types from their source files
import {
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  TextVarNode,
  DataVarNode,
  PathVarNode,
  CommentNode,
  NodeType,
  SourceLocation,
  DirectiveData,
  Field
} from './nodes';
import { DirectiveKind, CommandDefinition, CommandMetadata, RiskLevel } from './directives';
import { MultiLineBlock } from './syntax';
import { Parser, ParserTestCase } from './parser';
import {
  ValidationError,
  ValidationContext,
  ValidationResult,
  Example
} from './validation';

// Re-export all imported types
export {
  // Core node types
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  TextVarNode,
  DataVarNode,
  PathVarNode,
  CommentNode,
  NodeType,
  // Important supporting types
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  Field,
  // Command types
  CommandDefinition,
  CommandMetadata,
  RiskLevel,
  // Parser types
  Parser,
  ParserTestCase,
  // Validation types
  ValidationError,
  ValidationContext,
  ValidationResult,
  Example
};

// Export other types
export * from './directives';
export * from './syntax';
export * from './schema';
export * from './variables';
export * from './parser';
export * from './validation'; 