/**
 * Meld API Entry Point
 * 
 * Provides the main API for processing Meld documents programmatically.
 */
/// <reference types="node" />
import { MeldError } from '@core/errors/MeldError';
import { interpret } from '@interpreter/index';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

// Export core types/errors
export { MeldError };

// Export types
export type { Location, Position } from '@core/types/index';

/**
 * Options for processing Meld documents
 */
export interface ProcessOptions {
  /** Output format */
  format?: 'markdown' | 'xml';
  /** Base path for resolving relative paths */
  basePath?: string;
  /** Custom file system implementation */
  fileSystem?: IFileSystemService;
  /** Custom path service implementation */
  pathService?: IPathService;
}

/**
 * Process a Meld document and return the output
 */
export async function processMeld(content: string, options?: ProcessOptions): Promise<string> {
  // Create default services if not provided
  const fileSystem = options?.fileSystem || new NodeFileSystem();
  const pathService = options?.pathService || new PathService();
  const basePath = options?.basePath || process.cwd();
  
  // Call the interpreter
  const result = await interpret(content, {
    basePath,
    format: options?.format || 'markdown',
    fileSystem,
    pathService
  });

  return result;
}