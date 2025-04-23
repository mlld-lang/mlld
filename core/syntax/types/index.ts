// First export the shared-types which have no dependencies
export * from './shared-types';

// Import VariableType from core types
export { VariableType } from '@core/types/variables';

// Then export interfaces with type-only exports
export type { INode } from './interfaces/INode';
export type { IDirectiveNode, DirectiveData as IDirectiveData, DirectiveKind } from './interfaces/IDirectiveNode';
export type { ITextNode } from './interfaces/ITextNode';
export type { ICodeFenceNode } from './interfaces/ICodeFenceNode';
export type { ICommentNode } from './interfaces/ICommentNode';
export type { IErrorNode } from './interfaces/IErrorNode';
export type { 
  IVariableReference, 
  Field,
  ExtendedFormatOperator as FormatOperator
} from './interfaces/IVariableReference';
export type { NodeType, SourceLocation, Position } from './interfaces/common';

// Export factories using regular exports (these are values)
export { NodeFactory } from './factories/NodeFactory';
export { VariableNodeFactory } from './factories/VariableNodeFactory';
export { DirectiveNodeFactory } from './factories/DirectiveNodeFactory';
export { TextNodeFactory } from './factories/TextNodeFactory';
export { CodeFenceNodeFactory } from './factories/CodeFenceNodeFactory';
export { CommentNodeFactory } from './factories/CommentNodeFactory';
export { ErrorNodeFactory } from './factories/ErrorNodeFactory';

// Export constants (these are values, not types)
export { 
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from './interfaces/IVariableReference';

// Export legacy functions for backward compatibility
export { 
  createVariableReferenceNode,
  isVariableReferenceNode,
  isValidFieldArray
} from './legacy/variables';
export {
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
} from './legacy/nodes';

// Temporary re-export of existing types for backward compatibility
export * from './directives';
export * from './syntax';
export * from './schema';
export * from './parser';
export * from './validation';
export * from './test-fixtures';

// Import interfaces for type aliases
import type { INode } from './interfaces/INode';
import type { IDirectiveNode, DirectiveData as IDirectiveData } from './interfaces/IDirectiveNode';
import type { ITextNode } from './interfaces/ITextNode';
import type { ICodeFenceNode } from './interfaces/ICodeFenceNode';
import type { ICommentNode } from './interfaces/ICommentNode';
import type { IErrorNode } from './interfaces/IErrorNode';
import type { IVariableReference } from './interfaces/IVariableReference';

// Define type aliases for backward compatibility
type MeldNode = INode;
type DirectiveNode = IDirectiveNode;
type TextNode = ITextNode;
type CodeFenceNode = ICodeFenceNode;
type CommentNode = ICommentNode;
type ErrorNode = IErrorNode;
type VariableReferenceNode = IVariableReference;
type VariableNode = IVariableReference; // Legacy alias for backward compatibility
type DirectiveData = IDirectiveData;

// Export type aliases
export type {
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  CommentNode,
  ErrorNode,
  VariableReferenceNode,
  VariableNode,
  DirectiveData
};