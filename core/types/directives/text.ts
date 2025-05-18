/**
 * Text directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from '@core/types/nodes/directive';
import { TextNode, VariableReference } from '@core/types/nodes';

// Value definitions
export type VariableNodeArray = Array<VariableReference>;
export type ContentNodeArray = Array<TextNode | VariableReference>;

export interface TextValues {
  // Common to all text directive subtypes
  identifier?: VariableNodeArray;
  // Only for specific subtypes
  content?: ContentNodeArray | DirectiveNode; // Content can now be a nested directive
  source?: string; // 'literal', 'embed', 'run', or 'directive'
}

// Raw and meta definitions
export interface TextRaw {
  variable: string;
  format?: string;
}

export interface TextMeta {
  sourceType?: 'literal' | 'embed' | 'run' | 'directive';
  directive?: 'run' | 'add';
  hasVariables?: boolean;
  run?: {
    language?: string;
    isMultiLine?: boolean;
    isCommandRef?: boolean;
    commandName?: string;
  };
  add?: Record<string, unknown>;
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
    identifier: VariableNodeArray;
    content: ContentNodeArray; // Always a content array for templates
  };
  raw: {
    identifier: string;
    content: string;
  };
}