// First export the shared-types which have no dependencies
export * from './shared-types.js';

// Then export interfaces with type-only exports
export type { INode } from './interfaces/INode.js';
export type { IDirectiveNode, DirectiveData as IDirectiveData, DirectiveKind } from './interfaces/IDirectiveNode.js';
export type { ITextNode } from './interfaces/ITextNode.js';
export type { ICodeFenceNode } from './interfaces/ICodeFenceNode.js';
export type { ICommentNode } from './interfaces/ICommentNode.js';
export type { IErrorNode } from './interfaces/IErrorNode.js';
export type { 
  IVariableReference, 
  VariableType,
  Field,
  ExtendedFormatOperator as FormatOperator
} from './interfaces/IVariableReference.js';
export type { NodeType, SourceLocation, Position } from './interfaces/common.js';

// Export factories using regular exports (these are values)
export { NodeFactory } from './factories/NodeFactory.js';
export { VariableNodeFactory } from './factories/VariableNodeFactory.js';
export { DirectiveNodeFactory } from './factories/DirectiveNodeFactory.js';
export { TextNodeFactory } from './factories/TextNodeFactory.js';
export { CodeFenceNodeFactory } from './factories/CodeFenceNodeFactory.js';
export { CommentNodeFactory } from './factories/CommentNodeFactory.js';
export { ErrorNodeFactory } from './factories/ErrorNodeFactory.js';

// Export constants (these are values, not types)
export { 
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from './interfaces/IVariableReference.js';

// Export legacy functions for backward compatibility
export { 
  createVariableReferenceNode,
  isVariableReferenceNode,
  isValidFieldArray
} from './legacy/variables.js';
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
} from './legacy/nodes.js';

// Temporary re-export of existing types for backward compatibility
export * from './directives.js';
export * from './syntax.js';
export * from './schema.js';
export * from './parser.js';
export * from './validation.js';
export * from './test-fixtures.js';

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