/**
 * Run directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { ContentNodeArray, TextNodeArray, VariableNodeArray } from './values';
import { TrustLevel } from './primitives';

/**
 * With clause for pipeline and dependency management
 */
export interface WithClause {
  pipeline?: PipelineCommand[];
  needs?: DependencyMap;
  trust?: TrustLevel;
  [key: string]: any; // For other with clause properties
}

/**
 * A pipeline command reference
 */
export interface PipelineCommand {
  identifier: VariableNodeArray;
  args: VariableNodeArray[];
  fields?: any[]; // Field access array
  rawIdentifier: string;
  rawArgs: string[];
  // Optional inline effects attached to this functional stage.
  // These are pipeline builtin "effect" commands (e.g., @log) that should
  // execute after this stage succeeds, and do not count as stages themselves.
  effects?: PipelineCommand[];
}

/**
 * Dependency map by language
 */
export interface DependencyMap {
  [language: string]: {
    [packageName: string]: string; // version constraint
  };
}

/**
 * Run directive raw values
 */
export interface RunRaw {
  command?: string;
  lang?: string;
  args?: string[];
  code?: string;
  identifier?: string;
  withClause?: WithClause;
}

/**
 * Run directive metadata
 */
export interface RunMeta {
  isMultiLine?: boolean;
  argumentCount?: number;
  language?: string;
  hasVariables?: boolean;
  withClause?: WithClause;
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
  args?: VariableNodeArray;
  code?: ContentNodeArray;
  identifier?: VariableNodeArray;
  withClause?: WithClause;
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
    hasVariables: boolean;
  };
}

/**
 * Run Code directive - @run language [code]
 */
export interface RunCodeDirectiveNode extends RunDirectiveNode {
  subtype: 'runCode';
  values: {
    lang: TextNodeArray;
    args: VariableNodeArray;
    code: ContentNodeArray;
  };
  raw: {
    lang: string;
    args: string[];
    code: string;
  };
  meta: {
    isMultiLine: boolean;
    language: string;
  };
}

/**
 * Run Exec directive - @run $commandName (arg1, arg2)
 */
export interface RunExecDirectiveNode extends RunDirectiveNode {
  subtype: 'runExec';
  values: {
    identifier: VariableNodeArray;
    args: VariableNodeArray;
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
