/**
 * Run directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import type { Expression } from './primitives';
import { ContentNodeArray, TextNodeArray, VariableNodeArray } from './values';
import type { DataLabel } from './security';

/**
 * With clause for pipeline and dependency management
 */
export type PipelineStageEntry = PipelineCommand | InlineCommandStage | InlineValueStage;
export type PipelineStage = PipelineStageEntry | PipelineStageEntry[];

export interface GuardOverrideOptions {
  only?: string[];
  except?: string[];
}

export interface WithClause {
  pipeline?: PipelineStage[];
  needs?: DependencyMap;
  trust?: TrustLevel;
  parallel?: number;
  delayMs?: number;
  stdin?: Expression;
  guards?: GuardOverrideOptions | false;
  stream?: boolean;
  streamFormat?: any;
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
  meta?: Record<string, unknown>;
  // Optional inline effects attached to this functional stage.
  // These are pipeline builtin "effect" commands (e.g., @log) that should
  // execute after this stage succeeds, and do not count as stages themselves.
  effects?: PipelineCommand[];
}

/**
 * Inline shell command stage (cmd { ... }) executed directly in the pipeline
 */
export interface InlineCommandStage {
  type: 'inlineCommand';
  command: ContentNodeArray;
  commandBases?: VariableNodeArray;
  rawCommand: string;
  meta?: Record<string, unknown>;
  location?: any;
}

/**
 * Inline data stage ({ ... }) treated as a structured value source
 */
export interface InlineValueStage {
  type: 'inlineValue';
  value: any;
  rawIdentifier: string;
  meta?: Record<string, unknown>;
  location?: any;
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
  securityLabels?: string;
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
  securityLabels?: DataLabel[];
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
  securityLabels?: DataLabel[];
}

/**
 * Run Command directive - @run [command]
 */
export interface RunCommandDirectiveNode extends RunDirectiveNode {
  subtype: 'runCommand';
  values: {
    command: ContentNodeArray;
    securityLabels?: DataLabel[];
  };
  raw: {
    command: string;
    securityLabels?: string;
  };
  meta: {
    isMultiLine: boolean;
    hasVariables: boolean;
    securityLabels?: DataLabel[];
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
    securityLabels?: DataLabel[];
  };
  raw: {
    lang: string;
    args: string[];
    code: string;
    securityLabels?: string;
  };
  meta: {
    isMultiLine: boolean;
    language: string;
    securityLabels?: DataLabel[];
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
    securityLabels?: DataLabel[];
  };
  raw: {
    identifier: string;
    args: string[];
    securityLabels?: string;
  };
  meta: {
    argumentCount: number;
    securityLabels?: DataLabel[];
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
