/**
 * Types related to command definitions (@define directive).
 */

// Placeholders for service interfaces - assumed defined elsewhere
import type { IStateService } from './state';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { SourceLocation } from './common';

/**
 * Parameter metadata for command definitions
 */
export interface ICommandParameterMetadata {
  name: string;
  position: number;
  required?: boolean;
  defaultValue?: string;
  validationStatus?: 'valid' | 'invalid' | 'warning';
}

/**
 * Base interface for all command definitions
 */
export interface ICommandDefinitionBase {
  name: string;
  type: 'basic' | 'language';
  parameters: ICommandParameterMetadata[];
  originalText?: string;
  sourceLocation?: SourceLocation;
  visibility?: 'public' | 'private';
  riskLevel?: 'low' | 'medium' | 'high';
  description?: string;
  definedAt?: number;
  resolutionTracking?: {
    resolvedVariables: string[];
    unresolvedReferences: string[];
  };
}

/**
 * Definition for basic shell commands
 */
export interface IBasicCommandDefinition extends ICommandDefinitionBase {
  type: 'basic';
  commandTemplate: string;
  isMultiline: boolean;
  variableResolutionMode?: 'immediate' | 'deferred' | 'none';
}

/**
 * Definition for language-specific script commands
 */
export interface ILanguageCommandDefinition extends ICommandDefinitionBase {
  type: 'language';
  language: string;
  codeBlock: string;
  languageParameters?: string[];
  executionMode?: 'script' | 'interpreter' | 'embedded';
}

/**
 * Union type for all command definition types
 */
export type ICommandDefinition = IBasicCommandDefinition | ILanguageCommandDefinition;

/**
 * Command execution function type.
 * @remarks Define specific types for params and return value if possible.
 *          This might be deprecated if execution is handled internally.
 */
export type CommandExecuteFunction = (
  params: Record<string, any>,
  context: CommandExecutionContext
) => Promise<any>;

/**
 * Context provided during command execution.
 * @remarks This seems similar to ICommandExecutionContext from the spec,
 *          let's keep it for now but might consolidate later.
 */
export interface CommandExecutionContext {
  /** Current state service */
  state: IStateService;
  
  /** File system service */
  fileSystem: IFileSystemService;
  
  /** Path service */
  pathService: IPathService;
  
  /** Resolution service */
  resolutionService: IResolutionService;
  
  /** Source location of command invocation */
  location?: SourceLocation;
}

/**
 * Type guard for checking if a command definition is a basic command
 */
export function isBasicCommand(definition: ICommandDefinition): definition is IBasicCommandDefinition {
  return definition.type === 'basic';
}

/**
 * Type guard for checking if a command definition is a language command
 */
export function isLanguageCommand(definition: ICommandDefinition): definition is ILanguageCommandDefinition {
  return definition.type === 'language';
} 