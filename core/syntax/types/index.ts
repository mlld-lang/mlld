// First, export our new interfaces and factories
export * from './interfaces/index.js';
export * from './factories/index.js';

// Then export legacy functions and backward compatibility types
export * from './legacy/index.js';

// Temporary re-export of existing types for backward compatibility
export * from './directives.js';
export * from './syntax.js';
export * from './schema.js';
export * from './parser.js';
export * from './validation.js';
export * from './test-fixtures.js';

// Import interfaces for type aliases
import { INode } from './interfaces/INode.js';
import { IDirectiveNode, DirectiveData as IDirectiveData, DirectiveKind } from './interfaces/IDirectiveNode.js';
import { ITextNode } from './interfaces/ITextNode.js';
import { ICodeFenceNode } from './interfaces/ICodeFenceNode.js';
import { ICommentNode } from './interfaces/ICommentNode.js';
import { IErrorNode } from './interfaces/IErrorNode.js';
import { 
  IVariableReference, 
  VariableType,
  Field,
  FormatOperator,
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from './interfaces/IVariableReference.js';
import { NodeType, SourceLocation, Position } from './interfaces/common.js';

// Import legacy functions for re-export
import { 
  createVariableReferenceNode,
  isVariableReferenceNode,
  isValidFieldArray
} from './legacy/variables.js';
import {
  createDirectiveNode,
  isDirectiveNode,
  createTextNode,
  isTextNode,
  createCodeFenceNode,
  isCodeFenceNode,
  createCommentNode,
  isCommentNode,
  createErrorNode,
  isErrorNode,
  createNode,
  isDirective,
  isText,
  isCodeFence,
  isComment,
  isError
} from './legacy/nodes.js';

// Define type aliases for backward compatibility
export type MeldNode = INode;
export type DirectiveNode = IDirectiveNode;
export type TextNode = ITextNode;
export type CodeFenceNode = ICodeFenceNode;
export type CommentNode = ICommentNode;
export type ErrorNode = IErrorNode;
export type VariableReferenceNode = IVariableReference;
export type VariableNode = IVariableReference; // Legacy alias for backward compatibility
export type DirectiveData = IDirectiveData;

// Re-export core types
export {
  // Core node types
  NodeType,
  SourceLocation,
  Position,
  DirectiveKind,
  
  // Variable types
  VariableType,
  Field,
  FormatOperator,
  
  // Variable constants
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS,
  
  // Legacy node creation functions
  createNode,
  createDirectiveNode,
  createTextNode,
  createCodeFenceNode,
  createCommentNode,
  createErrorNode,
  createVariableReferenceNode,
  
  // Legacy type guards
  isDirectiveNode,
  isTextNode,
  isCodeFenceNode,
  isCommentNode,
  isErrorNode,
  isVariableReferenceNode,
  isValidFieldArray,
  
  // Simple type guards
  isDirective,
  isText,
  isCodeFence,
  isComment,
  isError
}; 