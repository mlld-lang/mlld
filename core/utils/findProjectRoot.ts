import * as path from 'path';
import type { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

async function findFirstAncestorWithFile(
  startPath: string,
  fileNames: readonly string[],
  fileSystem: IFileSystemService
): Promise<{ dir: string; fileName: string } | null> {
  let currentDir = path.resolve(startPath);

  while (true) {
    for (const fileName of fileNames) {
      if (await fileSystem.exists(path.join(currentDir, fileName))) {
        return { dir: currentDir, fileName };
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

/**
 * Find the project root by first searching for an explicit mlld config file and
 * only then falling back to broader project markers.
 *
 * @param startPath - The directory to start searching from
 * @param fileSystem - The filesystem service to use
 * @returns The project root path, or the original startPath if not found
 */
export async function findProjectRoot(
  startPath: string,
  fileSystem: IFileSystemService
): Promise<string> {
  logger.debug(`Finding project root from: ${startPath}`);

  const configMatch = await findFirstAncestorWithFile(
    startPath,
    ['mlld-config.json'],
    fileSystem
  );
  if (configMatch) {
    logger.debug(`Found ${configMatch.fileName} at: ${configMatch.dir}`);
    return configMatch.dir;
  }

  const fallbackMatch = await findFirstAncestorWithFile(
    startPath,
    ['package.json', '.git'],
    fileSystem
  );
  if (fallbackMatch) {
    logger.warn(
      `Found project root via ${fallbackMatch.fileName} at ${fallbackMatch.dir} but no mlld-config.json found`
    );
    return fallbackMatch.dir;
  }

  logger.debug(`No project root found, using original path: ${startPath}`);
  return startPath;
}
