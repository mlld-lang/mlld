/**
 * Exe directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, TextNodeArray, VariableNodeArray } from './values';
import { WithClause } from './run';
import { ParameterNode } from './primitives';

/**
 * Exe directive raw values
 */
export interface ExeRaw {
  identifier: string;
  params: string[];
  metadata?: string;
  command?: string;
  lang?: string;
  code?: string;
  withClause?: WithClause;
}

/**
 * Exe directive metadata
 */
export interface ExeMeta {
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
 * Base Exe directive node
 */
export interface ExeDirectiveNode extends TypedDirectiveNode<'exe', ExeSubtype> {
  values: ExeValues;
  raw: ExeRaw;
  meta: ExeMeta;
}

/**
 * Exe subtypes
 */
export type ExeSubtype = 'exeCommand' | 'exeCode';

/**
 * Exe directive values - different structures based on subtype
 */
export interface ExeValues {
  identifier: TextNodeArray;
  params: ParameterNode[];
  metadata?: TextNodeArray;
  command?: ContentNodeArray;
  lang?: TextNodeArray;
  code?: ContentNodeArray;
  withClause?: WithClause;
}

/**
 * Exe Command directive - /exe commandName (params) = /run [command]
 */
export interface ExeCommandDirectiveNode extends ExeDirectiveNode {
  subtype: 'exeCommand';
  values: {
    identifier: TextNodeArray;
    params: ParameterNode[];
    metadata?: TextNodeArray;
    command: ContentNodeArray;
  };
  raw: {
    identifier: string;
    params: string[];
    metadata?: string;
    command: string;
  };
  meta: ExeMeta;
}

/**
 * Exe Code directive - /exe commandName (params) = /run language [code]
 */
export interface ExeCodeDirectiveNode extends ExeDirectiveNode {
  subtype: 'exeCode';
  values: {
    identifier: TextNodeArray;
    params: ParameterNode[];
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
  meta: ExeMeta;
}

/**
 * Type guards to check the type of an exe directive
 */
export function isExeDirectiveNode(node: DirectiveNode): node is ExeDirectiveNode {
  return node.kind === 'exe';
}

export function isExeCommandDirective(node: ExeDirectiveNode): node is ExeCommandDirectiveNode {
  return node.subtype === 'exeCommand';
}

export function isExeCodeDirective(node: ExeDirectiveNode): node is ExeCodeDirectiveNode {
  return node.subtype === 'exeCode';
}