import { matchesCommandPattern, normalizeCommandPatternEntry, parseFsPatternEntry, matchesFsPattern, type FilesystemAccessMode } from './capability-patterns';

export const DEFAULT_DANGER_PATTERNS = Object.freeze([
  '@keychain',
  'cmd:mlld:keychain:*',
  'cmd:security:*',
  'cmd:pass:*',
  'cmd:op:*',
  'fs:r:~/.ssh/*',
  'fs:r:~/.aws/*',
  'fs:r:~/.config/gh/*',
  'fs:r:~/.netrc',
  'fs:r:**/.env',
  'fs:r:**/*.pem',
  'fs:r:**/*_rsa',
  'fs:r:**/*_ed25519',
  'fs:w:.claude/*',
  'fs:w:.codex/*',
  'fs:w:.mlld/*',
  'fs:w:.cursor/*',
  'fs:w:.continue/*',
  'fs:r:**/.anthropic/*',
  'fs:r:**/.openai/*',
  'cmd:claude:*:--dangerously-skip-permissions',
  'cmd:codex:*:--dangerously-bypass-approvals-and-sandbox',
  'cmd:codex:*:--full-auto',
  'cmd:mlld:*:--no-policy',
  'cmd:mlld:*:--no-guards',
  'cmd:rm:*:-rf',
  'cmd:sudo:*',
  'cmd:chmod:*',
  'cmd:chown:*',
  'cmd:dd:*',
  'cmd:mkfs:*',
  'cmd:git:push:*:--force',
  'cmd:git:remote:add:*',
  'cmd:kill:*',
  'cmd:pkill:*',
  'cmd:killall:*',
  'cmd:curl:*:--upload-file',
  'cmd:curl:*:-T',
  'cmd:scp:*',
  'cmd:rsync:*',
  'cmd:nc:*'
]);

export function normalizeDangerEntries(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const entries = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const normalized = String(entry).trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function isDangerousCommand(commandTokens: string[]): boolean {
  return DEFAULT_DANGER_PATTERNS.some(entry => {
    const pattern = normalizeCommandPatternEntry(entry);
    if (!pattern) {
      return false;
    }
    return matchesCommandPattern(commandTokens, pattern);
  });
}

export function isDangerousFilesystem(
  mode: FilesystemAccessMode,
  targetPath: string,
  basePath: string,
  homeDir: string
): boolean {
  return DEFAULT_DANGER_PATTERNS.some(entry => {
    const parsed = parseFsPatternEntry(entry);
    if (!parsed) {
      return false;
    }
    if (parsed.mode === 'read' && mode !== 'read') {
      return false;
    }
    return matchesFsPattern(targetPath, parsed.pattern, basePath, homeDir);
  });
}

export function isDangerAllowedForCommand(
  allowedEntries: string[],
  commandTokens: string[]
): boolean {
  for (const entry of allowedEntries) {
    const pattern = normalizeCommandPatternEntry(entry);
    if (!pattern) {
      continue;
    }
    if (matchesCommandPattern(commandTokens, pattern)) {
      return true;
    }
  }
  return false;
}

export function isDangerAllowedForFilesystem(
  allowedEntries: string[],
  mode: FilesystemAccessMode,
  targetPath: string,
  basePath: string,
  homeDir: string
): boolean {
  for (const entry of allowedEntries) {
    const parsed = parseFsPatternEntry(entry);
    if (!parsed) {
      continue;
    }
    if (parsed.mode === 'read' && mode !== 'read') {
      continue;
    }
    if (matchesFsPattern(targetPath, parsed.pattern, basePath, homeDir)) {
      return true;
    }
  }
  return false;
}

export function isDangerAllowedForKeychain(allowedEntries: string[]): boolean {
  return allowedEntries.some(entry => {
    const normalized = entry.trim();
    return normalized === '@keychain' || normalized === 'keychain';
  });
}
