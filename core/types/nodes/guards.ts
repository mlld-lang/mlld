import { MeldNode } from './index';
import { TextNode } from './text';
import { DirectiveNode } from './directive';
import { CodeFenceNode } from './codefence';
import { CommentNode } from './comment';
import { Variable, VariableReference } from './variable';
import { LiteralNode } from './literal';
import { DotSeparatorNode, PathSeparatorNode } from './separators';

// Type guards for all nodes using discriminated unions
export function isTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text';
}

export function isDirectiveNode(node: MeldNode): node is DirectiveNode {
  return node.type === 'Directive';
}

export function isCodeFenceNode(node: MeldNode): node is CodeFenceNode {
  return node.type === 'CodeFence';
}

export function isCommentNode(node: MeldNode): node is CommentNode {
  return node.type === 'Comment';
}

export function isVariable(node: MeldNode): node is Variable {
  return node.type === 'Variable';
}

export function isVariableReference(node: MeldNode): node is VariableReference {
  return node.type === 'VariableReference';
}

export function isLiteralNode(node: MeldNode): node is LiteralNode {
  return node.type === 'Literal';
}

export function isDotSeparatorNode(node: MeldNode): node is DotSeparatorNode {
  return node.type === 'DotSeparator';
}

export function isPathSeparatorNode(node: MeldNode): node is PathSeparatorNode {
  return node.type === 'PathSeparator';
}