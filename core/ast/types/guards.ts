/**
 * Type guards for Meld AST nodes using discriminated unions
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
  PathSeparatorNode
} from './nodes';

// Import the union type
import type { MeldNode } from './index';

// Import existing directive types
import { ImportDirectiveNode, ImportAllDirectiveNode, ImportSelectedDirectiveNode } from './import';
import { 
  TextDirectiveNode, 
  TextAssignmentDirectiveNode, 
  TextTemplateDirectiveNode,
  isNestedDirective,
  isNestedEmbedDirective,
  isNestedRunDirective 
} from './text';
import {
  DataDirectiveNode,
  DataAssignmentDirectiveNode,
  DataValue,
  isDataObjectValue,
  isDataArrayValue,
  isDirectiveValue,
  isContentNodeArray,
  isEmbedDirectiveValue,
  isRunDirectiveValue
} from './data';
import { ImportWildcardNode } from './values';

/**
 * Base node type guards using discriminated unions
 */

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

export function isVariableReferenceNode(node: MeldNode): node is VariableReferenceNode {
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
 * Text directive type guards
 */

export function isTextDirective(node: DirectiveNode): node is TextDirectiveNode {
  return node.kind === 'text';
}

export function isTextAssignmentDirective(node: DirectiveNode): node is TextAssignmentDirectiveNode {
  return node.kind === 'text' && node.subtype === 'textAssignment';
}

export function isTextTemplateDirective(node: DirectiveNode): node is TextTemplateDirectiveNode {
  return node.kind === 'text' && node.subtype === 'textTemplate';
}

/**
 * Updated text + embed/run directive type guards for nested directive structure
 */
export function isTextEmbedDirective(node: DirectiveNode): node is TextAssignmentDirectiveNode {
  return isTextAssignmentDirective(node) && isNestedEmbedDirective(node.values.content);
}

export function isTextRunDirective(node: DirectiveNode): node is TextAssignmentDirectiveNode {
  return isTextAssignmentDirective(node) && isNestedRunDirective(node.values.content);
}

/**
 * Data directive type guards
 */
export function isDataDirective(node: DirectiveNode): node is DataDirectiveNode {
  return node.kind === 'data';
}

export function isDataAssignmentDirective(node: DirectiveNode): node is DataAssignmentDirectiveNode {
  return node.kind === 'data' && node.subtype === 'dataAssignment';
}

/**
 * Data value with nested directive type guards
 */
export function isDataWithNestedDirective(node: DataAssignmentDirectiveNode): boolean {
  return isDirectiveValue(node.values.value);
}

export function isDataWithNestedEmbedDirective(node: DataAssignmentDirectiveNode): boolean {
  return isEmbedDirectiveValue(node.values.value);
}

export function isDataWithNestedRunDirective(node: DataAssignmentDirectiveNode): boolean {
  return isRunDirectiveValue(node.values.value);
}

/**
 * Check if a data object property contains a directive
 * Usage: hasDirectiveProperty(dataNode, 'propName')
 */
export function hasDirectiveProperty(node: DataAssignmentDirectiveNode, propName: string): boolean {
  if (!isDataObjectValue(node.values.value)) {
    return false;
  }
  
  const prop = node.values.value.properties[propName];
  return prop ? isDirectiveValue(prop) : false;
}

/**
 * General nested directive helper
 * Checks if any node has a nested directive of a specific kind
 */
export function hasNestedDirectiveOfKind(
  node: DirectiveNode, 
  kind: string, 
  path: string[] = []
): boolean {
  // For text directives that can have nested content
  if (isTextAssignmentDirective(node)) {
    if (isNestedDirective(node.values.content)) {
      if (node.values.content.kind === kind) {
        return true;
      }
    }
  }
  
  // For data directives that can have nested structures
  if (isDataAssignmentDirective(node)) {
    return hasNestedDirectiveInDataValue(node.values.value, kind);
  }
  
  return false;
}

/**
 * Helper to recursively check for nested directives in data values
 */
function hasNestedDirectiveInDataValue(value: DataValue, kind: string): boolean {
  if (isDirectiveValue(value)) {
    return value.kind === kind;
  }
  
  if (isDataObjectValue(value)) {
    return Object.values(value.properties).some(prop => 
      hasNestedDirectiveInDataValue(prop, kind)
    );
  }
  
  if (isDataArrayValue(value)) {
    return value.items.some(item => 
      hasNestedDirectiveInDataValue(item, kind)
    );
  }
  
  return false;
}