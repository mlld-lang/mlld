/**
 * Type guards for Mlld AST nodes using discriminated unions
 */

// Import node types for type guards
import type {
  TextNode,
  DirectiveNode,
  CodeFenceNode,
  CommentNode,
  VariableReferenceNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  ExecInvocation,
  NegationNode,
  FileReferenceNode,
  BinaryExpression,
  TernaryExpression,
  UnaryExpression,
  FieldAccessNode,
  ArraySliceNode,
  ArrayFilterNode,
  TimeDurationNode
} from './primitives';

// Import the union type
import type { MlldNode } from './index';

// Import existing directive types
import { ImportDirectiveNode, ImportAllDirectiveNode, ImportSelectedDirectiveNode } from './import';
import {
  DataValue,
  DataObjectValue,
  DataArrayValue,
  isDirectiveValue,
  isTemplateValue as isContentNodeArray,
  isDataObjectValue,
  isDataArrayValue,
  isEmbedDirectiveValue,
  isRunDirectiveValue,
  isNestedDirective,
  isNestedEmbedDirective,
  isNestedRunDirective
} from './var';
import { ImportWildcardNode } from './values';
import { WithClause } from './run';

// Define InterpolatableValue for the guard function
export type InterpolatableValue = Array<TextNode | VariableReferenceNode>;

/**
 * Type guard to check if a value is an InterpolatableValue array.
 * Checks if it's an array and if the first element (if any) looks like a TextNode or VariableReferenceNode.
 */
export function isInterpolatableValueArray(value: unknown): value is InterpolatableValue {
  return Array.isArray(value) && 
         (value.length === 0 || 
          (value[0] && typeof value[0] === 'object' && ('type' in value[0]) && 
           (value[0].type === 'Text' || value[0].type === 'VariableReference')));
}

/**
 * Base node type guards using discriminated unions
 */

export function isTextNode(node: MlldNode): node is TextNode {
  return node.type === 'Text';
}

export function isDirectiveNode(node: MlldNode): node is DirectiveNode {
  return node.type === 'Directive';
}

export function isCodeFenceNode(node: MlldNode): node is CodeFenceNode {
  return node.type === 'CodeFence';
}

export function isCommentNode(node: MlldNode): node is CommentNode {
  return node.type === 'Comment';
}

export function isVariableReferenceNode(node: MlldNode): node is VariableReferenceNode {
  return node.type === 'VariableReference';
}

export function isLiteralNode(node: MlldNode): node is LiteralNode {
  return node.type === 'Literal';
}

export function isDotSeparatorNode(node: MlldNode): node is DotSeparatorNode {
  return node.type === 'DotSeparator';
}

export function isPathSeparatorNode(node: MlldNode): node is PathSeparatorNode {
  return node.type === 'PathSeparator';
}

export function isFileReferenceNode(node: MlldNode): node is FileReferenceNode {
  return node.type === 'FileReference';
}

/**
 * Import directive type guards
 */

export function isImportDirective(node: DirectiveNode): node is ImportDirectiveNode {
  return node.kind === 'import';
}

export function isImportAllDirective(node: DirectiveNode): node is ImportAllDirectiveNode {
  return node.kind === 'import' && node.subtype === 'importAll';
}

export function isImportSelectedDirective(node: DirectiveNode): node is ImportSelectedDirectiveNode {
  return node.kind === 'import' && node.subtype === 'importSelected';
}

export function isWildcardImport(node: VariableReferenceNode): node is ImportWildcardNode {
  return node.valueType === 'import' && node.identifier === '*';
}





/**
 * ExecInvocation type guards
 */

export function isExecInvocation(node: any): node is ExecInvocation {
  return node?.type === 'ExecInvocation';
}

export function hasWithClause(directive: any): directive is { values: { withClause: WithClause } } {
  return directive?.values?.withClause !== undefined;
}

/**
 * Negation type guard
 */
export function isNegationNode(node: any): node is NegationNode {
  return node?.type === 'Negation';
}

/**
 * Expression type guards for logical operators
 */
export function isBinaryExpression(node: any): node is BinaryExpression {
  return node?.type === 'BinaryExpression';
}

export function isTernaryExpression(node: any): node is TernaryExpression {
  return node?.type === 'TernaryExpression';
}

export function isUnaryExpression(node: any): node is UnaryExpression {
  return node?.type === 'UnaryExpression';
}

/**
 * Array operation type guards
 */
export function isArraySliceNode(node: FieldAccessNode): node is ArraySliceNode {
  return node.type === 'arraySlice';
}

export function isArrayFilterNode(node: FieldAccessNode): node is ArrayFilterNode {
  return node.type === 'arrayFilter';
}

export function isTimeDurationNode(node: any): node is TimeDurationNode {
  return node?.type === 'TimeDuration';
}