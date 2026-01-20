import { homedir } from 'os';
import type { Environment } from '@interpreter/env/Environment';
import type { PolicyConfig, PolicyFilesystemRules } from '@core/policy/union';
import type { SourceLocation } from '@core/types';
import { MlldSecurityError } from '@core/errors';
import { matchesFsPattern, parseFsPatternEntry } from '@core/policy/capability-patterns';

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
  const basePath = env.getProjectRoot();
  const homeDir = homedir();

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
  if (!value || value === true || typeof value !== 'object') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return extractFilesystemRulesFromEntries(value);
  }
  const raw = (value as Record<string, unknown>).filesystem ?? (value as Record<string, unknown>).fs;
  return normalizeFilesystemRules(raw);
}

function extractFilesystemRulesFromEntries(entries: unknown[]): PolicyFilesystemRules | undefined {
  const read = new Set<string>();
  const write = new Set<string>();
  for (const entry of entries) {
    const parsed = parseFsPatternEntry(String(entry));
    if (!parsed) {
      continue;
    }
    if (parsed.mode === 'write') {
      write.add(parsed.pattern);
      read.add(parsed.pattern);
    } else {
      read.add(parsed.pattern);
    }
  }
  const rules: PolicyFilesystemRules = {};
  if (read.size > 0) {
    rules.read = Array.from(read);
  }
  if (write.size > 0) {
    rules.write = Array.from(write);
  }
  return Object.keys(rules).length > 0 ? rules : undefined;
}

function normalizeFilesystemRules(raw: unknown): PolicyFilesystemRules | undefined {
  if (raw === true || raw === '*' || raw === 'all') {
    return { read: ['**'], write: ['**'] };
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
    rules.read = mergePatternLists(rules.read, write);
  }
  return Object.keys(rules).length > 0 ? rules : undefined;
}

function normalizePatternList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === true || value === '*' || value === 'all') {
    return ['**'];
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(entry => normalizePatternEntry(String(entry)))
      .filter(entry => entry.length > 0);
    return Array.from(new Set(normalized));
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = normalizePatternEntry(String(value));
    return normalized ? [normalized] : [];
  }
  return undefined;
}

function normalizePatternEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === '*' || trimmed === '**') {
    return '**';
  }
  const parsed = parseFsPatternEntry(trimmed);
  if (parsed) {
    return parsed.pattern;
  }
  return trimmed;
}

function mergePatternLists(base: string[] | undefined, incoming: string[]): string[] {
  return Array.from(new Set([...(base ?? []), ...incoming]));
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
  if (patterns.some(pattern => pattern === '*' || pattern === '**')) {
    return true;
  }
  const basePath = env.getProjectRoot();
  const homeDir = homedir();
  return patterns.some(pattern => matchesFsPattern(targetPath, pattern, basePath, homeDir));
}
