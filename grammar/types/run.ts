/**
 * Run directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, TextNodeArray, VariableNodeArray } from './values';

/**
 * Run directive raw values
 */
export interface RunRaw {
  command?: string;
  lang?: string;
  args?: string[];
  code?: string;
  identifier?: string;
}

/**
 * Run directive metadata
 */
export interface RunMeta {
  isMultiLine?: boolean;
  argumentCount?: number;
}

/**
 * Base Run directive node
 */
export interface RunDirectiveNode extends TypedDirectiveNode<'run', RunSubtype> {
  values: RunValues;
  raw: RunRaw;
  meta: RunMeta;
}

/**
 * Run subtypes
 */
export type RunSubtype = 'runCommand' | 'runCode' | 'runExec';

/**
 * Run directive values - different structures based on subtype
 */
export interface RunValues {
  command?: ContentNodeArray;
  lang?: TextNodeArray;
  args?: VariableNodeArray[];
  code?: ContentNodeArray;
  identifier?: TextNodeArray;
}

/**
 * Run Command directive - @run [command]
 */
export interface RunCommandDirectiveNode extends RunDirectiveNode {
  subtype: 'runCommand';
  values: {
    command: ContentNodeArray;
  };
  raw: {
    command: string;
  };
  meta: {
    isMultiLine: boolean;
  };
}

/**
 * Run Code directive - @run language [code]
 */
export interface RunCodeDirectiveNode extends RunDirectiveNode {
  subtype: 'runCode';
  values: {
    lang: TextNodeArray;
    args: VariableNodeArray[];
    code: ContentNodeArray;
  };
  raw: {
    lang: string;
    args: string[];
    code: string;
  };
  meta: {
    isMultiLine: boolean;
  };
}

/**
 * Run Exec directive - @run $commandName (arg1, arg2)
 */
export interface RunExecDirectiveNode extends RunDirectiveNode {
  subtype: 'runExec';
  values: {
    identifier: TextNodeArray;
    args: VariableNodeArray[];
  };
  raw: {
    identifier: string;
    args: string[];
  };
  meta: {
    argumentCount: number;
  };
}

/**
 * Type guards to check the type of a run directive
 */
export function isRunCommandDirective(node: RunDirectiveNode): node is RunCommandDirectiveNode {
  return node.subtype === 'runCommand';
}

export function isRunCodeDirective(node: RunDirectiveNode): node is RunCodeDirectiveNode {
  return node.subtype === 'runCode';
}

export function isRunExecDirective(node: RunDirectiveNode): node is RunExecDirectiveNode {
  return node.subtype === 'runExec';
}