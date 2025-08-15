/**
 * Unified executable type definitions for mlld
 * 
 * This module defines a unified Executable interface that encompasses
 * both @exec commands and @text templates with parameters.
 */

import { MlldNode } from './nodes';
import { VariableMetadata } from './index';

/**
 * Base executable definition that can be invoked with parameters
 */
export interface BaseExecutable {
  /** The type of executable */
  type: 'command' | 'commandRef' | 'code' | 'template' | 'section' | 'resolver';
  /** Parameter names expected by this executable */
  paramNames: string[];
  /** Original directive type this came from (exec or text) */
  sourceDirective: 'exec' | 'text';
}

/**
 * Command executable - @exec name(params) = @run [command]
 */
export interface CommandExecutable extends BaseExecutable {
  type: 'command';
  commandTemplate: MlldNode[];
  sourceDirective: 'exec';
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
 * Unified executable type
 */
export type ExecutableDefinition = 
  | CommandExecutable 
  | CommandRefExecutable 
  | CodeExecutable 
  | TemplateExecutable
  | SectionExecutable
  | ResolverExecutable;

/**
 * Variable that stores an executable definition
 */
export interface ExecutableVariable {
  type: 'executable';
  name: string;
  value: ExecutableDefinition;
  metadata?: VariableMetadata;
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
  metadata?: Partial<VariableMetadata>
): ExecutableVariable {
  return {
    type: 'executable',
    name,
    value: definition,
    metadata: {
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ...metadata
    }
  };
}