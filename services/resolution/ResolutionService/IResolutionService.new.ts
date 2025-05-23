import type { InterpolatableValue } from '@core/ast/types';
import type { IStateService } from '@services/state/StateService/IStateService';

/**
 * Minimal resolution service interface following "AST Knows All" philosophy.
 * 
 * Consolidated from 15+ methods to essential ones that handlers actually need.
 * Handlers extract from AST, ResolutionService does the actual work.
 */
export interface IResolutionService {
  /**
   * Single entry point for all resolution.
   * Handles text interpolation, variable resolution, and command execution.
   */
  resolve(input: ResolutionInput): Promise<string>;
  
  /**
   * Resolve an array of AST nodes to a string.
   * Used by handlers for content, commands, paths.
   */
  resolveNodes(nodes: InterpolatableValue, context: ResolutionContext): Promise<string>;
  
  /**
   * Path-specific resolution with validation.
   * Handles special variables like $HOMEPATH, $PROJECTPATH.
   */
  resolvePath(path: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Execute a command and return its output.
   * Abstracts command execution from handlers.
   */
  executeCommand(command: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Execute code and return its output.
   * Abstracts code evaluation from handlers.
   */
  executeCode(code: string, language: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Read file content.
   * Used by AddDirectiveHandler for path includes.
   */
  readFile(path: string, context: ResolutionContext): Promise<string>;
  
  /**
   * Extract a section from markdown content.
   * Used by ImportHandler for section imports.
   */
  extractSection(content: string, section: string): string;
  
  /**
   * Initialize the service with dependencies.
   */
  initialize(deps: ResolutionServiceDependencies): void;
}

export interface ResolutionInput {
  value: string | InterpolatableValue;
  context: ResolutionContext;
  type: 'text' | 'path' | 'command';
}

export interface ResolutionContext {
  state: IStateService;
  basePath: string;
  currentFilePath: string;
  depth?: number; // For circular reference detection
}

export interface ResolutionServiceDependencies {
  fileSystem: {
    executeCommand(command: string): Promise<string>;
    getCwd(): string;
  };
  pathService: {
    resolve(path: string, basePath: string): string;
    normalize(path: string): string;
  };
}