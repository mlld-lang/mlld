// First, include shared types for direct access
export * from '../shared-types.js';

// Then export interfaces with proper type-only exports to avoid circular references
export type { NodeType, Position, SourceLocation } from './common.js';
export type { INode } from './INode.js';
export type { IDirectiveNode, DirectiveData, DirectiveKind, DirectiveKindString } from './IDirectiveNode.js';
export type { 
  IVariableReference, 
  VariableType, 
  Field, 
  ExtendedFormatOperator as FormatOperator 
} from './IVariableReference.js';
export type { ITextNode } from './ITextNode.js';
export type { ICodeFenceNode } from './ICodeFenceNode.js';
export type { ICommentNode } from './ICommentNode.js';
export type { IErrorNode } from './IErrorNode.js';

// Export constants (these are values, not types)
export { 
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from './IVariableReference.js';