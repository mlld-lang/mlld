/**
 * Type guard helper utilities for safe AST node access
 * 
 * These helpers provide safe ways to access properties on AST nodes
 * that may or may not exist, avoiding the need for inline type guards
 * throughout the codebase.
 */

import type { 
  MlldNode, 
  DirectiveNode, 
  TextNode, 
  VariableReferenceNode,
  ContentNodeArray 
} from '@core/types';
import { 
  isDirectiveNode, 
  isTextNode, 
  isVariableReferenceNode 
} from '@core/types/guards';

/**
 * Safely get the subtype of a directive node
 */
export function getDirectiveSubtype(node: MlldNode | undefined): string | undefined {
  return node && isDirectiveNode(node) ? node.subtype : undefined;
}

/**
 * Safely get the identifier from a variable reference node
 */
export function getVariableIdentifier(node: MlldNode | undefined): string | undefined {
  return node && isVariableReferenceNode(node) ? node.identifier : undefined;
}

/**
 * Safely get the content from a text node
 */
export function getTextContent(node: MlldNode | undefined): string | undefined {
  return node && isTextNode(node) ? node.content : undefined;
}

/**
 * Check if a node is a directive with a specific subtype
 */
export function isDirectiveWithSubtype(node: MlldNode, subtype: string): node is DirectiveNode {
  return isDirectiveNode(node) && node.subtype === subtype;
}

/**
 * Check if a node is a directive with a specific kind
 */
export function isDirectiveWithKind(node: MlldNode, kind: string): node is DirectiveNode {
  return isDirectiveNode(node) && node.kind === kind;
}

/**
 * Get all text content from a content node array
 */
export function extractTextContent(nodes: ContentNodeArray): string {
  return nodes
    .filter(isTextNode)
    .map(node => node.content)
    .join('');
}

/**
 * Get all variable identifiers from a content node array
 */
export function extractVariableIdentifiers(nodes: ContentNodeArray): string[] {
  return nodes
    .filter(isVariableReferenceNode)
    .map(node => node.identifier);
}

/**
 * Safely access directive values
 */
export function getDirectiveValues<T = any>(node: MlldNode | undefined): T | undefined {
  return node && isDirectiveNode(node) ? (node.values as T) : undefined;
}

/**
 * Safely access directive metadata
 */
export function getDirectiveMeta<T = any>(node: MlldNode | undefined): T | undefined {
  return node && isDirectiveNode(node) ? (node.meta as T) : undefined;
}

/**
 * Check if a value is a content node array
 */
export function isContentNodeArray(value: unknown): value is ContentNodeArray {
  return Array.isArray(value) && value.every(item => 
    typeof item === 'object' && item !== null && 'type' in item
  );
}

/**
 * Get the first text node content from an array
 */
export function getFirstTextContent(nodes: MlldNode[] | undefined): string | undefined {
  if (!nodes) return undefined;
  const textNode = nodes.find(isTextNode);
  return textNode?.content;
}

/**
 * Get the first variable reference identifier from an array
 */
export function getFirstVariableIdentifier(nodes: MlldNode[] | undefined): string | undefined {
  if (!nodes) return undefined;
  const varNode = nodes.find(isVariableReferenceNode);
  return varNode?.identifier;
}

/**
 * Check if a node array contains only text nodes
 */
export function isTextOnlyArray(nodes: MlldNode[]): nodes is TextNode[] {
  return nodes.length > 0 && nodes.every(isTextNode);
}

/**
 * Check if a node array contains any variable references
 */
export function hasVariableReferences(nodes: MlldNode[]): boolean {
  return nodes.some(isVariableReferenceNode);
}

/**
 * Safely get the string representation of a node
 */
export function getNodeString(node: MlldNode): string {
  if (isTextNode(node)) {
    return node.content;
  }
  if (isVariableReferenceNode(node)) {
    return `@${node.identifier}`;
  }
  if (isDirectiveNode(node)) {
    return `/${node.kind}`;
  }
  return node.type;
}