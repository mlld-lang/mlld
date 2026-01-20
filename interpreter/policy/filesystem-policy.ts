import path from 'path';
import minimatch from 'minimatch';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyConfig, PolicyFilesystemRules } from '@core/policy/union';
import type { SourceLocation } from '@core/types';
import { MlldSecurityError } from '@core/errors';

export type FilesystemAccessMode = 'read' | 'write';

export function enforceFilesystemAccess(
  env: Environment,
  mode: FilesystemAccessMode,
  targetPath: string,
  sourceLocation?: SourceLocation
): void {
  const policy = env.getPolicySummary();
  if (!policy) {
    return;
  }
  const allow = policy.allow;
  const deny = policy.deny;
  const allowListActive = allow !== undefined;
  const allowAll = allow === true;
  const allowRules = allowAll ? undefined : extractFilesystemRules(allow);
  const denyRules = extractFilesystemRules(deny);

  if (allowListActive && !allowAll) {
    if (!allowRules || !matchesFilesystemRules(allowRules, mode, env, targetPath)) {
      throw new MlldSecurityError(`Filesystem ${mode} denied by policy`, {
        code: 'POLICY_CAPABILITY_DENIED',
        sourceLocation,
        env
      });
    }
  }

  if (deny === true) {
    throw new MlldSecurityError(`Filesystem ${mode} denied by policy`, {
      code: 'POLICY_CAPABILITY_DENIED',
      sourceLocation,
      env
    });
  }

  if (denyRules && matchesFilesystemRules(denyRules, mode, env, targetPath)) {
    throw new MlldSecurityError(`Filesystem ${mode} denied by policy`, {
      code: 'POLICY_CAPABILITY_DENIED',
      sourceLocation,
      env
    });
  }
}

export async function readFileWithPolicy(
  env: Environment,
  pathOrUrl: string,
  sourceLocation?: SourceLocation
): Promise<string> {
  if (env.isURL(pathOrUrl)) {
    return env.readFile(pathOrUrl);
  }
  const resolvedPath = await env.resolvePath(pathOrUrl);
  enforceFilesystemAccess(env, 'read', resolvedPath, sourceLocation);
  return env.readFile(resolvedPath);
}

function extractFilesystemRules(value: PolicyConfig['allow'] | PolicyConfig['deny'] | undefined): PolicyFilesystemRules | undefined {
  if (!value || value === true || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = (value as Record<string, unknown>).filesystem;
  if (raw === true || raw === '*' || raw === 'all') {
    return { read: ['*'], write: ['*'] };
  }
  if (Array.isArray(raw) || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    const list = normalizePatternList(raw);
    if (list === undefined) {
      return undefined;
    }
    return { read: list, write: list };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const read = normalizePatternList((raw as { read?: unknown }).read);
  const write = normalizePatternList((raw as { write?: unknown }).write);
  const rules: PolicyFilesystemRules = {};
  if (read !== undefined) {
    rules.read = read;
  }
  if (write !== undefined) {
    rules.write = write;
  }
  return Object.keys(rules).length > 0 ? rules : undefined;
}

function normalizePatternList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === true || value === '*' || value === 'all') {
    return ['*'];
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(entry => String(entry).trim())
      .filter(entry => entry.length > 0);
    return Array.from(new Set(normalized));
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
  }
  return undefined;
}

function matchesFilesystemRules(
  rules: PolicyFilesystemRules,
  mode: FilesystemAccessMode,
  env: Environment,
  targetPath: string
): boolean {
  const patterns = rules[mode];
  if (!patterns) {
    return false;
  }
  const relative = getRelativePolicyPath(env, targetPath);
  if (!relative) {
    return false;
  }
  if (patterns.some(pattern => pattern === '*' || pattern === '**')) {
    return true;
  }
  const basePath = env.getProjectRoot();
  return patterns.some(pattern => matchesPattern(relative, pattern, basePath));
}

function getRelativePolicyPath(env: Environment, targetPath: string): string | null {
  const basePath = env.getProjectRoot();
  const absolutePath = path.resolve(targetPath);
  const relativePath = path.relative(basePath, absolutePath);
  const normalized = toPosixPath(relativePath);
  if (!normalized || normalized === '.') {
    return '.';
  }
  if (normalized.startsWith('..')) {
    return null;
  }
  return normalized;
}

function matchesPattern(relativePath: string, rawPattern: string, basePath: string): boolean {
  const normalizedPattern = normalizePattern(rawPattern, basePath);
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === '*' || normalizedPattern === '**') {
    return true;
  }
  return minimatch(relativePath, normalizedPattern, {
    dot: true,
    nocase: process.platform === 'win32'
  });
}

function normalizePattern(pattern: string, basePath: string): string {
  let normalized = pattern.trim();
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('@base/')) {
    normalized = normalized.slice('@base/'.length);
  } else if (normalized.startsWith('@root/')) {
    normalized = normalized.slice('@root/'.length);
  } else if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  if (path.isAbsolute(normalized)) {
    const absolutePattern = path.resolve(normalized);
    const relativePattern = path.relative(path.resolve(basePath), absolutePattern);
    const posixRelative = toPosixPath(relativePattern);
    if (!posixRelative || posixRelative === '.') {
      return '.';
    }
    if (posixRelative.startsWith('..')) {
      return '';
    }
    return posixRelative;
  }
  return toPosixPath(normalized);
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}
