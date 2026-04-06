/**
 * Exe directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, TextNodeArray } from './values';
import { WithClause } from './run';
import type { BaseMlldNode, ParameterNode, VariableReferenceNode } from './primitives';
import type { DataLabel } from './security';

export interface StaticOutputRecordNode extends BaseMlldNode {
  type: 'ExeOutputRecord';
  kind: 'static';
  name: string;
}

export interface DynamicOutputRecordNode extends BaseMlldNode {
  type: 'ExeOutputRecord';
  kind: 'dynamic';
  ref: VariableReferenceNode;
}

export type ExeOutputRecordNode = StaticOutputRecordNode | DynamicOutputRecordNode;

export interface ExeReturnNode extends BaseMlldNode {
  type: 'ExeReturn';
  values: BaseMlldNode[];
  raw?: string;
  meta?: {
    hasValue?: boolean;
  };
}

export interface ExeBlockNode extends BaseMlldNode {
  type: 'ExeBlock';
  values: {
    statements: BaseMlldNode[];
    return?: ExeReturnNode;
  };
  raw?: {
    statements?: string;
    hasReturn?: boolean;
  };
  meta?: {
    statementCount?: number;
    hasReturn?: boolean;
  };
}

/**
 * Exe directive raw values
 */
export interface ExeRaw {
  identifier: string;
  params: string[];
  metadata?: string;
  outputRecord?: string;
  command?: string;
  lang?: string;
  code?: string;
  value?: string;
  withClause?: WithClause;
  securityLabels?: string;
  statements?: string;
  hasReturn?: boolean;
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
  isNewExpression?: boolean;
  outputRecord?: string;
  metadata?: {
    type?: string;
    [key: string]: unknown;
  };
  withClause?: WithClause;
  securityLabels?: DataLabel[];
  statementCount?: number;
  hasReturn?: boolean;
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
export type ExeSubtype =
  | 'exeCommand'
  | 'exeCode'
  | 'exeData'
  | 'exeValue'
  | 'exeTemplate'
  | 'exeTemplateFile'
  | 'exeWhen'
  | 'exeForeach'
  | 'exeFor'
  | 'exeLoop'
  | 'exeBox'
  | 'exeResolver'
  | 'exeBlock';

/**
 * Exe directive values - different structures based on subtype
 */
export interface ExeValues {
  identifier: TextNodeArray;
  params: ParameterNode[];
  metadata?: TextNodeArray;
  outputRecord?: ExeOutputRecordNode[];
  command?: ContentNodeArray;
  lang?: TextNodeArray;
  code?: ContentNodeArray;
  value?: BaseMlldNode;
  withClause?: WithClause;
  securityLabels?: DataLabel[];
  statements?: BaseMlldNode[];
  return?: ExeReturnNode;
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
    securityLabels?: DataLabel[];
  };
  raw: {
    identifier: string;
    params: string[];
    metadata?: string;
    command: string;
    securityLabels?: string;
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
    securityLabels?: DataLabel[];
  };
  raw: {
    identifier: string;
    params: string[];
    metadata?: string;
    lang: string;
    code: string;
    securityLabels?: string;
  };
  meta: ExeMeta;
}

export interface ExeBlockDirectiveNode extends ExeDirectiveNode {
  subtype: 'exeBlock';
  values: {
    identifier: TextNodeArray;
    params: ParameterNode[];
    statements: BaseMlldNode[];
    return?: ExeReturnNode;
    securityLabels?: DataLabel[];
  };
  raw: {
    identifier: string;
    params: string[];
    statements: string;
    hasReturn: boolean;
    securityLabels?: string;
  };
  meta: ExeMeta & {
    statementCount: number;
    hasReturn: boolean;
  };
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
