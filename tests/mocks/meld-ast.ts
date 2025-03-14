// Import directly from core/ast
export { parse, MeldAstError } from '@core/ast';

// Export all the necessary types
export type { 
  MeldNode,
  DirectiveNode,
  TextNode,
  CodeFenceNode,
  VariableNode,
  ErrorNode,
  VariableReferenceNode,
  CommentNode,
  SourceLocation,
  NodeType,
  DirectiveKind,
  DirectiveData
} from '@core/syntax/types';