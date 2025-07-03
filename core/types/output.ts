/**
 * Type definitions for the output directive
 */
import { 
  TypedDirectiveNode,
  BaseMlldNode,
  TextNode,
  VariableReferenceNode
} from './base';

// Output directive subtypes
export type OutputSubtype = 
  | 'outputDocument'
  | 'outputFile'
  | 'outputStream'
  | 'outputEnv'
  | 'outputResolver'
  | 'outputVariable'
  | 'outputInvocation'
  | 'outputExecInvocation'
  | 'outputCommand'
  | 'outputLiteral';

// Output target types
export interface OutputTargetFile {
  type: 'file';
  path: BaseMlldNode[];
  raw: string;
  meta: {
    quoted?: boolean;
    bracketed?: boolean;
    unquoted?: boolean;
  };
}

export interface OutputTargetStream {
  type: 'stream';
  stream: 'stdout' | 'stderr';
  raw: string;
}

export interface OutputTargetEnv {
  type: 'env';
  varname: string | null; // null means use default MLLD_VARIABLE pattern
  raw: string;
}

export interface OutputTargetResolver {
  type: 'resolver';
  resolver: string;
  path: TextNode[];
  raw: string;
}

export type OutputTarget = 
  | OutputTargetFile
  | OutputTargetStream
  | OutputTargetEnv
  | OutputTargetResolver;

// Output source types
export interface OutputSourceVariable {
  type: 'variable';
  subtype: 'outputVariable' | 'outputInvocation';
  values: {
    identifier: VariableReferenceNode[];
    fields?: any[]; // Field access
    args?: BaseMlldNode[]; // For invocations
  };
  raw: {
    identifier: string;
    fields?: string[];
    args?: string[];
  };
}

export interface OutputSourceExec {
  type: 'exec';
  subtype: 'outputExecInvocation';
  values: any; // Exec invocation with tail modifiers
  raw: {
    commandName: string;
  };
}

export interface OutputSourceCommand {
  type: 'command';
  subtype: 'outputCommand';
  values: {
    identifier: VariableReferenceNode[];
    args: BaseMlldNode[];
  };
  raw: {
    identifier: string;
    args: string[];
  };
}

export interface OutputSourceLiteral {
  type: 'literal';
  subtype: 'outputLiteral';
  values: TextNode[];
  raw: string;
}

export type OutputSource = 
  | OutputSourceVariable
  | OutputSourceExec
  | OutputSourceCommand
  | OutputSourceLiteral;

// Base output directive interface
export interface OutputDirectiveBase extends TypedDirectiveNode<'output', OutputSubtype> {
  kind: 'output';
  values: {
    source?: OutputSource['values'];
    target: OutputTarget;
  };
  raw: {
    source?: OutputSource['raw'];
    target: string;
  };
  meta: {
    sourceType?: OutputSource['type'];
    targetType: OutputTarget['type'];
    hasSource: boolean;
    format?: string;
    explicitFormat?: boolean;
    legacy?: boolean; // For backward compatibility with [path] syntax
  };
}

// Specific output directive types
export interface OutputDocumentDirective extends OutputDirectiveBase {
  subtype: 'outputDocument';
  meta: OutputDirectiveBase['meta'] & { hasSource: false };
}

export interface OutputFileDirective extends OutputDirectiveBase {
  subtype: 'outputFile';
}

export interface OutputStreamDirective extends OutputDirectiveBase {
  subtype: 'outputStream';
}

export interface OutputEnvDirective extends OutputDirectiveBase {
  subtype: 'outputEnv';
}

export interface OutputResolverDirective extends OutputDirectiveBase {
  subtype: 'outputResolver';
}

// Union of all output directive types
export type OutputDirective = 
  | OutputDocumentDirective
  | OutputFileDirective
  | OutputStreamDirective
  | OutputEnvDirective
  | OutputResolverDirective;

// Type guards
export function isOutputDirective(node: BaseMlldNode): node is OutputDirective {
  return node.type === 'Directive' && (node as any).kind === 'output';
}

export function isOutputDocumentDirective(node: BaseMlldNode): node is OutputDocumentDirective {
  return isOutputDirective(node) && node.subtype === 'outputDocument';
}

export function isOutputFileDirective(node: BaseMlldNode): node is OutputFileDirective {
  return isOutputDirective(node) && node.subtype === 'outputFile';
}

export function isOutputStreamDirective(node: BaseMlldNode): node is OutputStreamDirective {
  return isOutputDirective(node) && node.subtype === 'outputStream';
}

export function isOutputEnvDirective(node: BaseMlldNode): node is OutputEnvDirective {
  return isOutputDirective(node) && node.subtype === 'outputEnv';
}

export function isOutputResolverDirective(node: BaseMlldNode): node is OutputResolverDirective {
  return isOutputDirective(node) && node.subtype === 'outputResolver';
}

// Utility function to check if target is a file
export function isFileTarget(target: OutputTarget): target is OutputTargetFile {
  return target.type === 'file';
}

// Utility function to check if target is a stream
export function isStreamTarget(target: OutputTarget): target is OutputTargetStream {
  return target.type === 'stream';
}

// Utility function to check if target is env
export function isEnvTarget(target: OutputTarget): target is OutputTargetEnv {
  return target.type === 'env';
}

// Utility function to check if target is resolver
export function isResolverTarget(target: OutputTarget): target is OutputTargetResolver {
  return target.type === 'resolver';
}