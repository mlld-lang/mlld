/**
 * Unified executable type definitions for mlld
 * 
 * This module defines a unified Executable interface that encompasses
 * both @exec commands and @text templates with parameters.
 */

import { MlldNode } from './nodes';
import { VariableContext, VariableInternal } from './index';
import type { PipelineStage } from './run';
import type { DataValue } from './var';
import type { PathMeta } from './meta';

/**
 * Base executable definition that can be invoked with parameters
 */
export interface BaseExecutable {
  /** The type of executable */
  type: 'command' | 'commandRef' | 'code' | 'template' | 'section' | 'resolver' | 'pipeline' | 'data' | 'prose' | 'nodeFunction' | 'nodeClass' | 'partial';
  /** Parameter names expected by this executable */
  paramNames: string[];
  /** Parameter types keyed by name */
  paramTypes?: Record<string, string>;
  /** Human-readable summary for tool metadata */
  description?: string;
  /** Original directive type this came from (exec or text) */
  sourceDirective: 'exec' | 'text';
}

/**
 * Command executable - @exec name(params) = @run [command]
 */
export interface CommandExecutable extends BaseExecutable {
  type: 'command';
  commandTemplate: MlldNode[];
  withClause?: any; // Stdin and other with-clause options
  sourceDirective: 'exec';
  workingDir?: MlldNode[];
  workingDirMeta?: PathMeta;
}

/**
 * Command reference executable - @exec name(params) = @otherCommand(args)
 */
export interface CommandRefExecutable extends BaseExecutable {
  type: 'commandRef';
  commandRef: string;
  commandArgs?: MlldNode[];
  withClause?: any; // Pipeline information from the original directive
  sourceDirective: 'exec';
}

/**
 * Code executable - @exec name(params) = @run language [code]
 */
export interface CodeExecutable extends BaseExecutable {
  type: 'code';
  codeTemplate: MlldNode[];
  language: string;
  sourceDirective: 'exec';
  workingDir?: MlldNode[];
  workingDirMeta?: PathMeta;
}

/**
 * Template executable - @text name(params) = [[template]]
 */
export interface TemplateExecutable extends BaseExecutable {
  type: 'template';
  template: MlldNode[];
  sourceDirective: 'text' | 'exec';
}

/**
 * Section executable - @exec name(file, section) = [@file # @section]
 */
export interface SectionExecutable extends BaseExecutable {
  type: 'section';
  pathTemplate: MlldNode[];
  sectionTemplate: MlldNode[];
  renameTemplate?: MlldNode[];
  sourceDirective: 'exec';
}

/**
 * Resolver executable - @exec name(params) = @resolver/path { @payload }
 */
export interface ResolverExecutable extends BaseExecutable {
  type: 'resolver';
  resolverPath: string;
  payloadTemplate?: MlldNode[];
  sourceDirective: 'exec';
}

/**
 * Pipeline executable - @exe name() = || @a() || @b()
 */
export interface PipelineExecutable extends BaseExecutable {
  type: 'pipeline';
  pipeline: PipelineStage[];
  format?: string;
  parallelCap?: number;
  delayMs?: number;
  sourceDirective: 'exec';
}

/**
 * Data executable - /exe name(params) = { ... } returning structured data
 */
export interface DataExecutable extends BaseExecutable {
  type: 'data';
  dataTemplate: DataValue;
  sourceDirective: 'exec';
}

/**
 * Prose executable - /exe name(params) = prose:@config { ... }
 * Executes OpenProse content via skill injection to a model
 */
export interface ProseExecutable extends BaseExecutable {
  type: 'prose';
  /** Reference to the config variable containing model settings */
  configRef: MlldNode[];
  /** Content type: 'inline' for {...}, 'file' for "path.prose", 'template' for template "path.prose.att" */
  contentType: 'inline' | 'file' | 'template';
  /** Inline prose content (for contentType='inline') */
  contentTemplate?: MlldNode[];
  /** Path to prose file (for contentType='file' or 'template') */
  pathTemplate?: MlldNode[];
  sourceDirective: 'exec';
}

/**
 * Node function executable - wraps a JS function for mlld invocation
 */
export interface NodeFunctionExecutable extends BaseExecutable {
  type: 'nodeFunction';
  name: string;
  fn: (...args: unknown[]) => unknown;
  thisArg?: unknown;
  moduleName?: string;
  sourceDirective: 'exec';
}

/**
 * Node class executable - wraps a JS constructor for constructor expressions
 */
export interface NodeClassExecutable extends BaseExecutable {
  type: 'nodeClass';
  name: string;
  constructorFn: new (...args: unknown[]) => unknown;
  moduleName?: string;
  sourceDirective: 'exec';
}

/**
 * Partial executable - pre-binds arguments for a base executable
 */
export interface PartialExecutable extends BaseExecutable {
  type: 'partial';
  base: ExecutableDefinition;
  boundArgs: unknown[];
  sourceDirective: 'exec';
}

/**
 * Unified executable type
 */
export type ExecutableDefinition =
  | CommandExecutable
  | CommandRefExecutable
  | CodeExecutable
  | TemplateExecutable
  | SectionExecutable
  | ResolverExecutable
  | PipelineExecutable
  | DataExecutable
  | ProseExecutable
  | NodeFunctionExecutable
  | NodeClassExecutable
  | PartialExecutable;

/**
 * Variable that stores an executable definition
 */
export interface ExecutableVariable {
  type: 'executable';
  name: string;
  value: ExecutableDefinition;
  paramTypes?: Record<string, string>;
  description?: string;
  mx: VariableContext;
  internal?: VariableInternal;
}

/**
 * Type guards for executable types
 */
export function isCommandExecutable(def: ExecutableDefinition): def is CommandExecutable {
  return def.type === 'command';
}

export function isCommandRefExecutable(def: ExecutableDefinition): def is CommandRefExecutable {
  return def.type === 'commandRef';
}

export function isCodeExecutable(def: ExecutableDefinition): def is CodeExecutable {
  return def.type === 'code';
}

export function isTemplateExecutable(def: ExecutableDefinition): def is TemplateExecutable {
  return def.type === 'template';
}

export function isSectionExecutable(def: ExecutableDefinition): def is SectionExecutable {
  return def.type === 'section';
}

export function isResolverExecutable(def: ExecutableDefinition): def is ResolverExecutable {
  return def.type === 'resolver';
}

export function isPipelineExecutable(def: ExecutableDefinition): def is PipelineExecutable {
  return def.type === 'pipeline';
}

export function isDataExecutable(def: ExecutableDefinition): def is DataExecutable {
  return def.type === 'data';
}

export function isProseExecutable(def: ExecutableDefinition): def is ProseExecutable {
  return def.type === 'prose';
}

export function isNodeFunctionExecutable(def: ExecutableDefinition): def is NodeFunctionExecutable {
  return def.type === 'nodeFunction';
}

export function isNodeClassExecutable(def: ExecutableDefinition): def is NodeClassExecutable {
  return def.type === 'nodeClass';
}

export function isPartialExecutable(def: ExecutableDefinition): def is PartialExecutable {
  return def.type === 'partial';
}

/**
 * Check if an executable came from an exec directive
 */
export function isExecSourced(def: ExecutableDefinition): boolean {
  return def.sourceDirective === 'exec';
}

/**
 * Check if an executable came from a text directive
 */
export function isTextSourced(def: ExecutableDefinition): boolean {
  return def.sourceDirective === 'text';
}

/**
 * Create an executable variable
 */
export function createExecutableVariable(
  name: string,
  definition: ExecutableDefinition,
  options?: { mx?: Partial<VariableContext>; internal?: Partial<VariableInternal> }
): ExecutableVariable {
  return {
    type: 'executable',
    name,
    value: definition,
    mx: {
      ...options?.mx
    },
    internal: {
      ...options?.internal
    }
  };
}
