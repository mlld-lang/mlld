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
import { PathContextBuilder, type PathContext } from '@core/services/PathContextService';

// Export core types/errors
export { MlldError };
export { ErrorFormatSelector };
export type { FormattedErrorResult, ErrorFormatOptions };

// Export utilities
export { DependencyDetector } from '@core/utils/dependency-detector';
export { PathContextBuilder } from '@core/services/PathContextService';
export { ExecutionEmitter } from './execution-emitter';

// Export types
export type { Location, Position } from '@core/types/index';
export type { PathContext, PathContextOptions } from '@core/services/PathContextService';

/**
 * Options for processing Mlld documents
 */
export interface ProcessOptions {
  /** Output format */
  format?: 'markdown' | 'xml';
  /** Base path for resolving relative paths (deprecated - use filePath) */
  basePath?: string;
  /** File path being processed (recommended) */
  filePath?: string;
  /** Explicit path context (advanced usage) */
  pathContext?: PathContext;
  /** Custom file system implementation */
  fileSystem?: IFileSystemService;
  /** Custom path service implementation */
  pathService?: IPathService;
  /** Control blank line normalization (default: true) */
  normalizeBlankLines?: boolean;
  /** Use prettier for markdown formatting (default: true) */
  useMarkdownFormatter?: boolean;
}

/**
 * Process a Mlld document and return the output
 */
export async function processMlld(content: string, options?: ProcessOptions): Promise<string> {
  // Create default services if not provided
  const fileSystem = options?.fileSystem || new NodeFileSystem();
  const pathService = options?.pathService || new PathService();
  
  // Build or use PathContext
  let pathContext: PathContext | undefined;
  if (options?.pathContext) {
    pathContext = options.pathContext;
  } else if (options?.filePath) {
    pathContext = await PathContextBuilder.fromFile(options.filePath, fileSystem);
  }
  
  // Call the interpreter
  const result = await interpret(content, {
    basePath: options?.basePath, // Keep for backward compatibility
    filePath: options?.filePath,
    pathContext,
    format: options?.format || 'markdown',
    fileSystem,
    pathService,
    normalizeBlankLines: options?.normalizeBlankLines,
    useMarkdownFormatter: options?.useMarkdownFormatter
  });

  // Interpret returns string output in document mode; other modes carry output on the object
  return typeof result === 'string' ? result : result.output;
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
