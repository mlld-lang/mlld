// Import types from their source files
import {
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  CommentNode,
  NodeType,
  SourceLocation,
  DirectiveData
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
import {
  VariableType,
  Field,
  VariableReferenceNode,
  FormatOperator,
  isVariableReferenceNode,
  isValidFieldArray,
  createVariableReferenceNode,
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS,
  // Legacy variable node types
  TextVarNode,
  DataVarNode,
  PathVarNode,
  convertLegacyVariableNode
} from './variables';

// Re-export all imported types
export {
  // Core node types
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode, // Deprecated but kept for backward compatibility
  ErrorNode,
  CommentNode,
  NodeType,
  // Important supporting types
  SourceLocation,
  DirectiveData,
  DirectiveKind,
  MultiLineBlock,
  // Variable types
  VariableType,
  Field,
  VariableReferenceNode,
  FormatOperator,
  // Legacy variable node types (for compatibility)
  TextVarNode,
  DataVarNode,
  PathVarNode,
  convertLegacyVariableNode,
  // Variable utilities
  isVariableReferenceNode,
  isValidFieldArray,
  createVariableReferenceNode,
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS,
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
export * from './test-fixtures'; 