/**
 * Text directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, VariableNodeArray } from './values';
import { TextRaw } from './raw';
import { TextMeta } from './meta';

/**
 * Text directive values - different structures based on subtype
 */
export interface TextValues {
  // Common to all text directive subtypes
  identifier?: VariableNodeArray;
  // Only for specific subtypes
  content?: ContentNodeArray | DirectiveNode; // Content can now be a nested directive
  source?: string; // 'literal', 'embed', 'run', or 'directive'
}

/**
 * Base Text directive node
 */
export interface TextDirectiveNode extends TypedDirectiveNode<'text', 'textAssignment' | 'textTemplate'> {
  values: TextValues;
  raw: TextRaw;
  meta: TextMeta;
}

/**
 * Text Assignment directive - @text var = "value"
 * Can be a literal string, template, or nested directive
 */
export interface TextAssignmentDirectiveNode extends TextDirectiveNode {
  subtype: 'textAssignment';
  values: {
    identifier: VariableNodeArray;
    content: ContentNodeArray | DirectiveNode; // Can be a content array OR a directive node
  };
  raw: {
    identifier: string;
    content: string;
  };
}

/**
 * Text Template directive - @text var = [content with {{variables}}]
 */
export interface TextTemplateDirectiveNode extends TextDirectiveNode {
  subtype: 'textTemplate';
  values: {
    identifier?: VariableNodeArray; // Optional because templates may not be assigned to a variable
    content: ContentNodeArray;
  };
  raw: {
    identifier?: string;
    content: string;
  };
}

/**
 * Type guard to check if content is a nested directive
 */
export function isNestedDirective(content: ContentNodeArray | DirectiveNode): content is DirectiveNode {
  return !Array.isArray(content) && 'kind' in content;
}

/**
 * Type guard to check if content is a nested embed directive
 */
export function isNestedEmbedDirective(content: ContentNodeArray | DirectiveNode): content is DirectiveNode {
  return isNestedDirective(content) && content.kind === 'embed';
}

/**
 * Type guard to check if content is a nested run directive
 */
export function isNestedRunDirective(content: ContentNodeArray | DirectiveNode): content is DirectiveNode {
  return isNestedDirective(content) && content.kind === 'run';
}

/**
 * Type guard to check if text node has an embed directive as content
 */
export function isTextWithEmbedSource(node: TextAssignmentDirectiveNode): boolean {
  return isNestedEmbedDirective(node.values.content);
}

/**
 * Type guard to check if text node has a run directive as content
 */
export function isTextWithRunSource(node: TextAssignmentDirectiveNode): boolean {
  return isNestedRunDirective(node.values.content);
}

