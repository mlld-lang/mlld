// First, include shared types for direct access
export * from '../shared-types';

// Then export interfaces with proper type-only exports to avoid circular references
export type { NodeType, Position, SourceLocation } from './common';
export type { INode } from './INode';
export type { IDirectiveNode, DirectiveData, DirectiveKind, DirectiveKindString } from './IDirectiveNode';
export type { 
  IVariableReference, 
  VariableType, 
  Field, 
  ExtendedFormatOperator as FormatOperator 
} from './IVariableReference';
export type { ITextNode } from './ITextNode';
export type { ICodeFenceNode } from './ICodeFenceNode';
export type { ICommentNode } from './ICommentNode';
export type { IErrorNode } from './IErrorNode';

// Export constants (these are values, not types)
export { 
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from './IVariableReference';