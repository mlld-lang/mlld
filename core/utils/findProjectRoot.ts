import * as path from 'path';
import * as os from 'os';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

/**
 * Find the project root by searching up the directory tree for mlld.lock.json
 * or other project indicators.
 * 
 * @param startPath - The directory to start searching from
 * @param fileSystem - The filesystem service to use
 * @returns The project root path, or the original startPath if not found
 */
export async function findProjectRoot(
  startPath: string,
  fileSystem: IFileSystemService
): Promise<string> {
  let currentDir = path.resolve(startPath);
  const homeDir = os.homedir();
  
  logger.debug(`Finding project root from: ${startPath}`);
  
  while (currentDir !== homeDir && currentDir !== path.dirname(currentDir)) {
    // First priority: mlld.lock.json
    const lockFilePath = path.join(currentDir, 'mlld.lock.json');
    if (await fileSystem.exists(lockFilePath)) {
      logger.debug(`Found mlld.lock.json at: ${currentDir}`);
      return currentDir;
    }
    
    // Fallback indicators (if no mlld.lock.json found)
    const fallbackIndicators = ['package.json', '.git', 'pyproject.toml', 'Cargo.toml'];
    for (const indicator of fallbackIndicators) {
      if (await fileSystem.exists(path.join(currentDir, indicator))) {
        // Found a project root, but warn that mlld.lock.json is missing
        logger.warn(`Found project root at ${currentDir} but mlld.lock.json is missing`);
        return currentDir;
      }
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  // If no project root found, return original startPath
  logger.debug(`No project root found, using original path: ${startPath}`);
  return startPath;
}