/**
 * Run directive type definitions
 */
import { TypedDirectiveNode } from '@core/types/nodes/directive';
import { TextNode, VariableReference } from '@core/types/nodes';

// Value definitions
export type ContentNodeArray = Array<TextNode | VariableReference>;
export type VariableNodeArray = Array<VariableReference>;

export interface RunValues {
  command?: ContentNodeArray;
  code?: ContentNodeArray;
  exec?: ContentNodeArray;
  parameters?: ContentNodeArray;
}

// Raw and meta definitions
export interface RunRaw {
  command?: string;
  code?: string;
  exec?: string;
  parameters?: string;
}

export interface RunMeta {
  language?: string;
  outputMode?: 'standard' | 'literal'; // formerly standard/transformation
  isCodeBlock?: boolean;
  isCommandRef?: boolean;
  commandName?: string;
}

/**
 * Base Run directive node
 */
export interface RunDirectiveNode extends TypedDirectiveNode<'run', 'runCommand' | 'runCode' | 'runExec'> {
  values: RunValues;
  raw: RunRaw;
  meta: RunMeta;
}

/**
 * Run Command directive - execute command
 */
export interface RunCommandDirectiveNode extends RunDirectiveNode {
  subtype: 'runCommand';
  values: {
    command: ContentNodeArray;
  };
}

/**
 * Run Code directive - execute code block
 */
export interface RunCodeDirectiveNode extends RunDirectiveNode {
  subtype: 'runCode';
  values: {
    code: ContentNodeArray;
  };
}

/**
 * Run Exec directive - execute defined command with parameters
 */
export interface RunExecDirectiveNode extends RunDirectiveNode {
  subtype: 'runExec';
  values: {
    exec: ContentNodeArray;
    parameters?: ContentNodeArray;
  };
}