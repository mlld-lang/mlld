import { parse } from '@core/ast/parser';
import type { MeldNode } from '@core/ast/types';
import { MeldAstError, ParseErrorCode } from '@core/ast/types';
import type { ParseResult, ParserOptions } from '@core/ast/types';
import { parse as grammarParse, SyntaxError } from '@core/ast/grammar/index';

// Core functionality
export { parse };
export { grammarParse, SyntaxError };

// Error handling and types
export { MeldAstError, ParseErrorCode };
export type { ParseResult, ParserOptions, MeldNode };

// Types from consolidated core AST types
export type {
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  VariableReferenceNode,
  CommentNode,
  NodeType,
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
} from '@core/ast/types/index';

// Additional types
export type {
  PeggyError,
  PeggyLocation
} from './types';

// Import helpers from the correct location
import helpers from './grammar/deps/helpers';

// Utilities - destructure from the helpers object
export const {
  createNode,
  getLocation,
  textJoin
} = helpers; 