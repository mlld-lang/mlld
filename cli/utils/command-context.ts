/**
 * Command Context Utilities
 * 
 * Provides consistent path resolution and project context for CLI commands.
 * Ensures all commands work correctly regardless of where they're run from
 * within a project directory structure.
 */

import * as path from 'path';
import { findProjectRoot } from '@core/utils/findProjectRoot';
import { LockFile } from '@core/registry/LockFile';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { cliLogger } from '@core/utils/logger';

export interface CommandContext {
  projectRoot: string;
  lockFile: LockFile | null;
  currentDir: string;
  relativeToRoot: string;
}

export interface CommandContextOptions {
  requireLockFile?: boolean;
  startPath?: string;
}

/**
 * Get the command execution context by finding the project root
 * and loading the lock file if available.
 */
export async function getCommandContext(
  options: CommandContextOptions = {}
): Promise<CommandContext> {
  const fileSystem = new NodeFileSystem();
  const startPath = options.startPath || process.cwd();
  const currentDir = path.resolve(startPath);
  
  // Find project root
  const projectRoot = await findProjectRoot(currentDir, fileSystem);
  
  // Calculate relative path from project root to current directory
  const relativeToRoot = path.relative(projectRoot, currentDir);
  
  // Try to load lock file
  let lockFile: LockFile | null = null;
  const canonicalPath = path.join(projectRoot, 'mlld-lock.json');
  const fallbackPaths = [
    path.join(projectRoot, 'mlld.lock.json'),
    path.join(projectRoot, '.mlld', 'mlld.lock.json')
  ];

  try {
    lockFile = new LockFile(canonicalPath, { fallbackPaths });
    // Touch the lock file data if required to ensure it exists
    if (options.requireLockFile) {
      const entries = lockFile.getAllModules();
      let hasPhysicalFile = false;
      for (const candidate of [canonicalPath, ...fallbackPaths]) {
        try {
          if (await fileSystem.exists(candidate)) {
            hasPhysicalFile = true;
            break;
          }
        } catch {
          // Ignore errors while probing paths
        }
      }
      if (!hasPhysicalFile && Object.keys(entries).length === 0) {
        throw new Error(`No lock file found in project root: ${projectRoot}`);
      }
    }
    cliLogger.debug(`Loaded lock file from: ${canonicalPath}`);
  } catch (error) {
    lockFile = null;
    if (options.requireLockFile) {
      throw error;
    }
    cliLogger.debug(`Could not load lock file: ${error}`);
  }
  
  return {
    projectRoot,
    lockFile,
    currentDir,
    relativeToRoot
  };
}

/**
 * Resolve a path relative to the project root, handling various input formats.
 * 
 * @param inputPath - The path to resolve (can be relative to cwd or project root)
 * @param context - The command context
 * @returns Resolved absolute path
 */
export function resolveProjectPath(
  inputPath: string,
  context: CommandContext
): string {
  // If already absolute, return as-is
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  
  // First try relative to current directory
  const fromCwd = path.resolve(context.currentDir, inputPath);
  
  // If that path exists or we're creating a new file, use it
  const fileSystem = new NodeFileSystem();
  if (fileSystem.existsSync(fromCwd)) {
    return fromCwd;
  }
  
  // Otherwise try relative to project root
  const fromRoot = path.resolve(context.projectRoot, inputPath);
  
  // For new files, prefer current directory unless path explicitly starts with project indicator
  if (inputPath.startsWith('./') || inputPath.startsWith('../')) {
    return fromCwd;
  }
  
  return fromRoot;
}

/**
 * Get configuration value from lock file with fallback
 */
export function getConfig<T>(
  context: CommandContext,
  path: string,
  defaultValue: T
): T {
  if (!context.lockFile) {
    return defaultValue;
  }
  
  try {
    const lockData = (context.lockFile as any).data;
    const parts = path.split('.');
    let value: any = lockData;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) {
        return defaultValue;
      }
    }
    
    return value as T;
  } catch {
    return defaultValue;
  }
}