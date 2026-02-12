import type {
  BaseMlldNode,
  CodeFenceNode,
  CommentNode,
  DirectiveNode,
  ErrorNode,
  FrontmatterNode,
  MlldNode,
  NewlineNode,
  TextNode,
  VariableReferenceNode
} from '@core/types';
import type { InterpolationNode } from '@interpreter/utils/interpolation';

export interface DocumentNode extends BaseMlldNode {
  type: 'Document';
  nodes: MlldNode[];
}

export interface MlldRunBlockNode extends BaseMlldNode {
  type: 'MlldRunBlock';
  content: MlldNode[];
  raw: string;
  error?: string;
}

export function isDocument(node: MlldNode): node is DocumentNode {
  return node.type === 'Document';
}

export function isDirective(node: MlldNode): node is DirectiveNode {
  return node.type === 'Directive';
}

export function isText(node: MlldNode): node is TextNode {
  return node.type === 'Text';
}

export function isNewline(node: MlldNode): node is NewlineNode {
  return node.type === 'Newline';
}

export function isComment(node: MlldNode): node is CommentNode {
  return node.type === 'Comment';
}

export function isFrontmatter(node: MlldNode): node is FrontmatterNode {
  return node.type === 'Frontmatter';
}

export function isCodeFence(node: MlldNode): node is CodeFenceNode {
  return node.type === 'CodeFence';
}

export function isMlldRunBlock(node: MlldNode): node is MlldRunBlockNode {
  return node.type === 'MlldRunBlock';
}

export function isVariableReference(node: MlldNode): node is VariableReferenceNode {
  return node.type === 'VariableReference';
}

export function isError(node: MlldNode): node is ErrorNode {
  return node.type === 'Error';
}

export function extractInterpolationNodesFromTemplateLikeNode(node: unknown): InterpolationNode[] | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const candidate = node as any;
  if ('content' in candidate && Array.isArray(candidate.content) && 'wrapperType' in candidate && !candidate.type) {
    return candidate.content;
  }

  if (candidate.type === 'template' && candidate.values?.content && Array.isArray(candidate.values.content)) {
    return candidate.values.content;
  }

  if (candidate.type === 'template' && Array.isArray(candidate.content)) {
    return candidate.content;
  }

  return null;
}
