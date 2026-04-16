import os from 'os';
import path from 'path';

/**
 * Single source of truth for mlld's gitignored state directories.
 *
 * `PROJECT_STATE_DIR` holds per-project runtime state: audit log, caches,
 * checkpoints, installed run scripts. It lives at `<projectRoot>/.llm`.
 *
 * `USER_STATE_DIR` holds cross-project user state: auth tokens and shared
 * module/package caches. It lives at `~/.llm`.
 *
 * `mlld-config.json` and `mlld-lock.json` are committed and stay at the
 * project root — they are not state.
 */
export const PROJECT_STATE_DIR = '.llm';
export const USER_STATE_DIR = '.llm';

/** Legacy project state dir used before the `.llm/` rename. */
export const LEGACY_PROJECT_STATE_DIR = '.mlld';
/** Legacy user state dir used before the `.llm/` rename. */
export const LEGACY_USER_STATE_DIR = '.mlld';

// --- Project state (per-project, gitignored) ---

export function projectStateDir(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_STATE_DIR);
}

export function legacyProjectStateDir(projectRoot: string): string {
  return path.join(projectRoot, LEGACY_PROJECT_STATE_DIR);
}

export function auditLogPath(projectRoot: string): string {
  return path.join(projectStateDir(projectRoot), 'sec', 'audit.jsonl');
}

export function projectCacheDir(projectRoot: string, ...segments: string[]): string {
  return path.join(projectStateDir(projectRoot), 'cache', ...segments);
}

export function importCacheDir(projectRoot: string): string {
  return projectCacheDir(projectRoot, 'imports');
}

export function checkpointsDir(projectRoot: string): string {
  return path.join(projectStateDir(projectRoot), 'checkpoints');
}

export function projectRunDir(projectRoot: string): string {
  return path.join(projectStateDir(projectRoot), 'run');
}

// --- User state (cross-project, gitignored) ---

export function userStateDir(): string {
  return path.join(os.homedir(), USER_STATE_DIR);
}

export function legacyUserStateDir(): string {
  return path.join(os.homedir(), LEGACY_USER_STATE_DIR);
}

export function userCacheDir(...segments: string[]): string {
  return path.join(userStateDir(), 'cache', ...segments);
}

export function userModuleCacheDir(): string {
  return userCacheDir('sha256');
}

export function userPythonCacheDir(): string {
  return userCacheDir('python');
}

export function userAuthPath(): string {
  return path.join(userStateDir(), 'auth.json');
}

export function userRunDir(): string {
  return path.join(userStateDir(), 'run');
}
