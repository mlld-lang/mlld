// First export the shared-types which have no dependencies
export * from './shared-types.js';

// Then export interfaces and factories with explicit annotations
export { INode } from './interfaces/INode.js';
export { IDirectiveNode, DirectiveData as IDirectiveData, DirectiveKind } from './interfaces/IDirectiveNode.js';
export { ITextNode } from './interfaces/ITextNode.js';
export { ICodeFenceNode } from './interfaces/ICodeFenceNode.js';
export { ICommentNode } from './interfaces/ICommentNode.js';
export { IErrorNode } from './interfaces/IErrorNode.js';
export { 
  IVariableReference, 
  VariableType,
  Field,
  ExtendedFormatOperator as FormatOperator
} from './interfaces/IVariableReference.js';
export { NodeType, SourceLocation, Position } from './interfaces/common.js';

// Export factories using explicit type annotations
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
export type MeldNode = INode;
export type DirectiveNode = IDirectiveNode;
export type TextNode = ITextNode;
export type CodeFenceNode = ICodeFenceNode;
export type CommentNode = ICommentNode;
export type ErrorNode = IErrorNode;
export type VariableReferenceNode = IVariableReference;
export type VariableNode = IVariableReference; // Legacy alias for backward compatibility
export type DirectiveData = IDirectiveData;