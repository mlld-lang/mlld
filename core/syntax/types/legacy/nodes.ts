import { container } from 'tsyringe';
import { 
  SourceLocation, 
  DirectiveKindString,
  DirectiveData,
  NodeType
} from '@core/syntax/types/interfaces/index';
import { 
  NodeFactory,
  DirectiveNodeFactory, 
  TextNodeFactory,
  CodeFenceNodeFactory,
  CommentNodeFactory,
  ErrorNodeFactory
} from '@core/syntax/types/factories/index';

/**
 * Legacy function to create a directive node
 * @deprecated Use DirectiveNodeFactory directly
 */
export function createDirectiveNode(
  kind: DirectiveKindString,
  data: Partial<DirectiveData> = {},
  location?: SourceLocation
) {
  const factory = container.resolve(DirectiveNodeFactory);
  return factory.createDirectiveNode(kind, data, location);
}

/**
 * Legacy function to check if a node is a directive node
 * @deprecated Use DirectiveNodeFactory directly
 */
export function isDirectiveNode(node: any) {
  const factory = container.resolve(DirectiveNodeFactory);
  return factory.isDirectiveNode(node);
}

/**
 * Legacy function to create a text node
 * @deprecated Use TextNodeFactory directly
 */
export function createTextNode(
  content: string,
  location?: SourceLocation
) {
  const factory = container.resolve(TextNodeFactory);
  return factory.createTextNode(content, location);
}

/**
 * Legacy function to check if a node is a text node
 * @deprecated Use TextNodeFactory directly
 */
export function isTextNode(node: any) {
  const factory = container.resolve(TextNodeFactory);
  return factory.isTextNode(node);
}

/**
 * Legacy function to create a code fence node
 * @deprecated Use CodeFenceNodeFactory directly
 */
export function createCodeFenceNode(
  content: string,
  language?: string,
  location?: SourceLocation
) {
  const factory = container.resolve(CodeFenceNodeFactory);
  return factory.createCodeFenceNode(content, language, location);
}

/**
 * Legacy function to check if a node is a code fence node
 * @deprecated Use CodeFenceNodeFactory directly
 */
export function isCodeFenceNode(node: any) {
  const factory = container.resolve(CodeFenceNodeFactory);
  return factory.isCodeFenceNode(node);
}

/**
 * Legacy function to create a generic MeldNode
 * @deprecated Use NodeFactory directly
 */
export function createNode(
  type: NodeType,
  location?: SourceLocation
) {
  const factory = container.resolve(NodeFactory);
  return factory.createNode(type, location);
}

/**
 * Legacy type guards for node types
 * @deprecated Use specific factory type guards instead
 */
export function isDirective(node: any): boolean {
  return node && node.type === 'Directive';
}

export function isText(node: any): boolean {
  return node && node.type === 'Text';
}

export function isCodeFence(node: any): boolean {
  return node && node.type === 'CodeFence';
}

export function isComment(node: any): boolean {
  return node && node.type === 'Comment';
}

export function isError(node: any): boolean {
  return node && node.type === 'Error';
}

/**
 * Legacy function to create a comment node
 * @deprecated Use CommentNodeFactory directly
 */
export function createCommentNode(
  content: string,
  location?: SourceLocation
) {
  const factory = container.resolve(CommentNodeFactory);
  return factory.createCommentNode(content, location);
}

/**
 * Legacy function to check if a node is a comment node
 * @deprecated Use CommentNodeFactory directly
 */
export function isCommentNode(node: any) {
  const factory = container.resolve(CommentNodeFactory);
  return factory.isCommentNode(node);
}

/**
 * Legacy function to create an error node
 * @deprecated Use ErrorNodeFactory directly
 */
export function createErrorNode(
  message: string,
  stack?: string,
  location?: SourceLocation
) {
  const factory = container.resolve(ErrorNodeFactory);
  return factory.createErrorNode(message, stack, location);
}

/**
 * Legacy function to check if a node is an error node
 * @deprecated Use ErrorNodeFactory directly
 */
export function isErrorNode(node: any) {
  const factory = container.resolve(ErrorNodeFactory);
  return factory.isErrorNode(node);
}