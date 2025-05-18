/**
 * Exec directive type definitions
 */
import { TypedDirectiveNode } from '@core/types/nodes/directive';
import { TextNode, VariableReference } from '@core/types/nodes';

// Value definitions
export type ContentNodeArray = Array<TextNode | VariableReference>;
export type VariableNodeArray = Array<VariableReference>;

export interface ExecValues {
  command?: ContentNodeArray;
  reference?: VariableNodeArray;
  code?: ContentNodeArray;
}

// Raw and meta definitions
export interface ExecRaw {
  command?: string;
  reference?: string;
  code?: string;
}

export interface ExecMeta {
  language?: string;
  isMultiLine?: boolean;
  isCommandRef?: boolean;
  commandName?: string;
}

/**
 * Base Exec directive node
 */
export interface ExecDirectiveNode extends TypedDirectiveNode<'define', 'execCommand' | 'execReference' | 'execCode'> {
  values: ExecValues;
  raw: ExecRaw;
  meta: ExecMeta;
}

/**
 * Exec Command directive - execute command directly
 */
export interface ExecCommandDirectiveNode extends ExecDirectiveNode {
  subtype: 'execCommand';
  values: {
    command: ContentNodeArray;
  };
}

/**
 * Exec Reference directive - execute defined command
 */
export interface ExecReferenceDirectiveNode extends ExecDirectiveNode {
  subtype: 'execReference';
  values: {
    reference: VariableNodeArray;
  };
}

/**
 * Exec Code directive - execute code block
 */
export interface ExecCodeDirectiveNode extends ExecDirectiveNode {
  subtype: 'execCode';
  values: {
    code: ContentNodeArray;
  };
}