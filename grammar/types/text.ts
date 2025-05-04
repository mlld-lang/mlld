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
  source?: string; // 'literal', 'embed', 'run', or 'call'
}

/**
 * Base Text directive node
 */
export interface TextDirectiveNode extends TypedDirectiveNode<'text', 'textAssignment' | 'textBracketed'> {
  values: TextValues;
  raw: TextRaw;
  meta: TextMeta;
}

/**
 * Text Assignment directive - text var = value
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
}

/**
 * Text Bracketed directive - text [content]
 */
export interface TextBracketedDirectiveNode extends TextDirectiveNode {
  subtype: 'textBracketed';
  values: {
    content: ContentNodeArray;
  };
  raw: {
    content: string;
  };
}

/**
 * Text with Embed directive - text var = @embed path
 */
export interface TextEmbedDirectiveNode extends TextAssignmentDirectiveNode {
  values: {
    identifier: VariableNodeArray;
    content: ContentNodeArray;
    source: 'embed';
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: TextMeta & {
    embed: unknown; // Type based on embed structure
  };
}

/**
 * Text with Run directive - text var = @run command
 */
export interface TextRunDirectiveNode extends TextAssignmentDirectiveNode {
  values: {
    identifier: VariableNodeArray;
    content: ContentNodeArray;
    source: 'run';
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: TextMeta & {
    run: unknown; // Type based on run structure
  };
}

/**
 * Text with Call directive - text var = @call api.method content
 */
export interface TextCallDirectiveNode extends TextAssignmentDirectiveNode {
  values: {
    identifier: VariableNodeArray;
    content: ContentNodeArray;
    source: 'call';
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: TextMeta & {
    call: {
      api: string;
      method: string;
    };
  };
}