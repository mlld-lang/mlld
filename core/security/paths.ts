import fs from 'fs';
import path from 'path';

function normalizeDirPath(dirPath: string): string {
  const trimmed = dirPath.replace(/[\\/]+$/, '');
  const normalized = path.normalize(trimmed || dirPath);
  const withForwardSlashes = normalized.replace(/\\/g, '/');
  if (process.platform === 'win32') {
    return withForwardSlashes.toLowerCase();
  }
  return withForwardSlashes;
}

function resolveRealPath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Returns all parent directories for a given file path, from the most specific
 * to the broadest, stopping before the filesystem root.
 *
 * Rules:
 * - Always resolve to an absolute path first.
 * - Follow symlinks (use the resolved path).
 * - Include all parent directories.
 * - Stop before root (do not include the root itself).
 * - Normalize slashes and strip trailing separators.
 * - Respect platform case rules (case-insensitive on Windows).
 */
export function getAllDirsInPath(filePath: string): string[] {
  const realPath = resolveRealPath(filePath);
  const normalizedPath = normalizeDirPath(realPath);
  const parsed = path.parse(normalizedPath);
  const root = normalizeDirPath(parsed.root || path.sep);

  const dirs: string[] = [];
  let currentDir = normalizeDirPath(path.dirname(normalizedPath));

  while (currentDir && currentDir !== root) {
    dirs.push(currentDir);
    const nextDir = normalizeDirPath(path.dirname(currentDir));
    if (nextDir === currentDir) {
      break;
    }
    currentDir = nextDir;
  }

  return dirs;
}

export function labelsForPath(filePath: string): string[] {
  return getAllDirsInPath(filePath).map(dir => `dir:${dir}`);
}
