/**
 * Mlld API Entry Point
 * 
 * Provides the main API for processing Mlld documents programmatically.
 */
/// <reference types="node" />
import { MlldError } from '@core/errors/MlldError';
import { interpret } from '@interpreter/index';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import type { IPathService } from '@services/fs/IPathService';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { ErrorFormatSelector, type FormattedErrorResult, type ErrorFormatOptions } from '@core/utils/errorFormatSelector';

// Export core types/errors
export { MlldError };
export { ErrorFormatSelector };
export type { FormattedErrorResult, ErrorFormatOptions };

// Export types
export type { Location, Position } from '@core/types/index';

/**
 * Options for processing Mlld documents
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
 * Process a Mlld document and return the output
 */
export async function processMlld(content: string, options?: ProcessOptions): Promise<string> {
  // Create default services if not provided
  const fileSystem = options?.fileSystem || new NodeFileSystem();
  const pathService = options?.pathService || new PathService();
  const basePath: string = options?.basePath || process.cwd();
  
  // Call the interpreter
  const result: string = await interpret(content, {
    basePath,
    format: options?.format || 'markdown',
    fileSystem,
    pathService
  });

  return result;
}

/**
 * Enhanced error formatting for API users
 * 
 * @example
 * ```typescript
 * try {
 *   await processMlld(content);
 * } catch (error) {
 *   if (error instanceof MlldError) {
 *     const formatter = new ErrorFormatSelector(fileSystem);
 *     const result = await formatter.formatAuto(error, {
 *       useSmartPaths: true,
 *       basePath: '/path/to/project'
 *     });
 *     
 *     console.log(result.formatted); // Human-readable
 *     console.log(result.json);      // Structured data
 *   }
 * }
 * ```
 */
export async function formatError(
  error: MlldError,
  options?: ErrorFormatOptions & { fileSystem?: IFileSystemService }
): Promise<FormattedErrorResult> {
  const { fileSystem, ...formatOptions } = options || {};
  const formatter = new ErrorFormatSelector(fileSystem);
  return await formatter.formatAuto(error, formatOptions);
}