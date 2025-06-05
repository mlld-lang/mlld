/**
 * Exec directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, TextNodeArray, VariableNodeArray } from './values';
import { WithClause } from './run';

/**
 * Exec directive raw values
 */
export interface ExecRaw {
  identifier: string;
  params: string[];
  metadata?: string;
  command?: string;
  lang?: string;
  code?: string;
  withClause?: WithClause;
}

/**
 * Exec directive metadata
 */
export interface ExecMeta {
  parameterCount: number;
  argumentCount?: number;
  hasVariables?: boolean;
  language?: string;
  isMultiLine?: boolean;
  metadata?: {
    type?: string;
    [key: string]: unknown;
  };
  withClause?: WithClause;
}

/**
 * Base Exec directive node
 */
export interface ExecDirectiveNode extends TypedDirectiveNode<'exec', ExecSubtype> {
  values: ExecValues;
  raw: ExecRaw;
  meta: ExecMeta;
}

/**
 * Exec subtypes
 */
export type ExecSubtype = 'execCommand' | 'execCode';

/**
 * Exec directive values - different structures based on subtype
 */
export interface ExecValues {
  identifier: TextNodeArray;
  params: VariableNodeArray[];
  metadata?: TextNodeArray;
  command?: ContentNodeArray;
  lang?: TextNodeArray;
  code?: ContentNodeArray;
  withClause?: WithClause;
}

/**
 * Exec Command directive - @exec commandName (params) = @run [command]
 */
export interface ExecCommandDirectiveNode extends ExecDirectiveNode {
  subtype: 'execCommand';
  values: {
    identifier: TextNodeArray;
    params: VariableNodeArray[];
    metadata?: TextNodeArray;
    command: ContentNodeArray;
  };
  raw: {
    identifier: string;
    params: string[];
    metadata?: string;
    command: string;
  };
  meta: ExecMeta;
}

/**
 * Exec Code directive - @exec commandName (params) = @run language [code]
 */
export interface ExecCodeDirectiveNode extends ExecDirectiveNode {
  subtype: 'execCode';
  values: {
    identifier: TextNodeArray;
    params: VariableNodeArray[];
    metadata?: TextNodeArray;
    lang: TextNodeArray;
    code: ContentNodeArray;
  };
  raw: {
    identifier: string;
    params: string[];
    metadata?: string;
    lang: string;
    code: string;
  };
  meta: ExecMeta;
}

/**
 * Type guards to check the type of an exec directive
 */
export function isExecDirectiveNode(node: DirectiveNode): node is ExecDirectiveNode {
  return node.kind === 'exec';
}

export function isExecCommandDirective(node: ExecDirectiveNode): node is ExecCommandDirectiveNode {
  return node.subtype === 'execCommand';
}

export function isExecCodeDirective(node: ExecDirectiveNode): node is ExecCodeDirectiveNode {
  return node.subtype === 'execCode';
}