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
  TextVarNode,
  DataVarNode,
  PathVarNode,
  SourceLocation,
  NodeType,
  DirectiveKind,
  DirectiveData
} from '@core/syntax/types';