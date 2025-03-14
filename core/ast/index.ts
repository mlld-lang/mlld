import { parse } from './parser.js';
import type { MeldNode } from '@core/syntax/types';
import { MeldAstError, ParseErrorCode } from './types.js';
import type { ParseResult, ParserOptions } from './types.js';
import { parse as grammarParse, SyntaxError } from './grammar/index.js';

// Core functionality
export { parse };
export { grammarParse, SyntaxError };

// Error handling and types
export { MeldAstError, ParseErrorCode };
export type { ParseResult, ParserOptions, MeldNode };

// Types from consolidated core syntax types
export type {
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

// Additional types
export type {
  PeggyError,
  PeggyLocation
} from './types.js';

// Utilities
export {
  createNode,
  getLocation,
  textJoin
} from './grammar/helpers.js'; 