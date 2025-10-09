import * as path from 'path';
import * as os from 'os';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

/**
 * Find the project root by searching up the directory tree for mlld config files
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
    // Check for mlld config files (new names first, old name for backward compatibility)
    const configFiles = [
      'mlld-config.json',
      'mlld-lock.json',
      'mlld.lock.json'  // Backward compatibility
    ];

    for (const configFile of configFiles) {
      const configPath = path.join(currentDir, configFile);
      if (await fileSystem.exists(configPath)) {
        logger.debug(`Found ${configFile} at: ${currentDir}`);
        return currentDir;
      }
    }

    // Fallback indicators (if no mlld config files found)
    const fallbackIndicators = ['package.json', '.git', 'pyproject.toml', 'Cargo.toml'];
    for (const indicator of fallbackIndicators) {
      if (await fileSystem.exists(path.join(currentDir, indicator))) {
        // Found a project root, but warn that mlld config is missing
        logger.warn(`Found project root at ${currentDir} but no mlld config files found`);
        return currentDir;
      }
    }

    currentDir = path.dirname(currentDir);
  }

  // If no project root found, return original startPath
  logger.debug(`No project root found, using original path: ${startPath}`);
  return startPath;
}