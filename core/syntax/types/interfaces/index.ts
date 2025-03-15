// First, include shared types for direct access
export * from '../shared-types.js';

// Then export interfaces with proper annotations to avoid circular references
export { NodeType, Position, SourceLocation } from './common.js';
export { INode } from './INode.js';
export { IDirectiveNode, DirectiveData, DirectiveKind } from './IDirectiveNode.js';
export { 
  IVariableReference, 
  VariableType, 
  Field, 
  ExtendedFormatOperator as FormatOperator 
} from './IVariableReference.js';
export { ITextNode } from './ITextNode.js';
export { ICodeFenceNode } from './ICodeFenceNode.js';
export { ICommentNode } from './ICommentNode.js';
export { IErrorNode } from './IErrorNode.js';

// Export constants (these are values, not types)
export { 
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from './IVariableReference.js';