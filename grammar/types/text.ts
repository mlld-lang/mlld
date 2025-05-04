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
  content?: ContentNodeArray;
  source?: string; // 'literal', 'embed', or 'run'
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
 */
export interface TextAssignmentDirectiveNode extends TextDirectiveNode {
  subtype: 'textAssignment';
  values: {
    identifier: VariableNodeArray;
    content: ContentNodeArray;
  };
  raw: {
    identifier: string;
    content: string;
  };
  
  // Optional field when the source is another directive
  sourceDirective?: {
    directive: DirectiveNode; // The actual directive providing the value
    type: 'embed' | 'run';    // Type discriminator
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

// Type guard helpers for source directives
export function isTextWithEmbedSource(node: TextAssignmentDirectiveNode): boolean {
  return !!node.sourceDirective && node.sourceDirective.type === 'embed';
}

export function isTextWithRunSource(node: TextAssignmentDirectiveNode): boolean {
  return !!node.sourceDirective && node.sourceDirective.type === 'run';
}

