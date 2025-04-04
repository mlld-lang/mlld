/**
 * Types related to command definitions (@define directive).
 */

// Placeholders for service interfaces - assumed defined elsewhere
import type { IStateService } from './state.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { SourceLocation } from './common.js';

/**
 * Command definition structure.
 * @remarks This is a placeholder. It should align with the detailed definition 
 * in _spec/types/define-spec.md.
 * Assuming ICommandDefinition represents the union: 
 * IBasicCommandDefinition | ILanguageCommandDefinition
 */
export type ICommandDefinition = any; // Placeholder - should be replaced/imported as per define-spec.md

/**
 * Command execution function type.
 * @remarks Define specific types for params and return value if possible.
 */
export type CommandExecuteFunction = (
  params: Record<string, any>,
  context: CommandExecutionContext
) => Promise<any>;

/**
 * Context provided during command execution.
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