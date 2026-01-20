import path from 'path';
import minimatch from 'minimatch';
import * as shellQuote from 'shell-quote';

export type FilesystemAccessMode = 'read' | 'write';

type ParsedFsPattern = {
  mode: FilesystemAccessMode;
  pattern: string;
};

function normalizeShellToken(token: unknown): string | null {
  if (typeof token === 'string') {
    return token;
  }
  if (!token || typeof token !== 'object') {
    return null;
  }
  const entry = token as { op?: string; pattern?: string };
  if (entry.op === 'glob' && typeof entry.pattern === 'string') {
    return entry.pattern;
  }
  return null;
}

function tokenizeCommand(commandString: string): string[] {
  if (!commandString) {
    return [];
  }
  const parsed = shellQuote.parse(commandString);
  return parsed
    .map(normalizeShellToken)
    .filter((token): token is string => typeof token === 'string' && token.length > 0);
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function normalizeCommandToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  const parts = trimmed.split('/');
  const base = parts[parts.length - 1] || trimmed;
  return base.toLowerCase();
}

export function getCommandTokens(commandString: string): string[] {
  const raw = tokenizeCommand(commandString);
  let index = 0;
  while (index < raw.length && isEnvAssignment(raw[index])) {
    index += 1;
  }
  return raw.slice(index).map(normalizeCommandToken).filter(Boolean);
}

export function normalizeCommandPatternEntry(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'cmd') {
    return '*';
  }
  if (lower.startsWith('cmd:')) {
    const pattern = trimmed.slice(4).trim();
    return pattern || '*';
  }
  return null;
}

function stripCommandPrefix(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.toLowerCase().startsWith('cmd:')) {
    return trimmed.slice(4).trim();
  }
  return trimmed;
}

export function parseCommandPatternTokens(pattern: string): string[] {
  const stripped = stripCommandPrefix(pattern);
  if (!stripped) {
    return [];
  }
  const parts = stripped.split(':');
  const tokens: string[] = [];
  for (const part of parts) {
    const chunk = part.trim();
    if (!chunk) {
      continue;
    }
    const parsed = shellQuote.parse(chunk)
      .map(normalizeShellToken)
      .filter((token): token is string => typeof token === 'string' && token.length > 0)
      .map(normalizeCommandToken)
      .filter(Boolean);
    tokens.push(...parsed);
  }
  return tokens;
}

function matchesTokenSequence(tokens: string[], patternTokens: string[]): boolean {
  let tokenIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let starMatchIndex = 0;

  while (tokenIndex < tokens.length) {
    const patternToken = patternTokens[patternIndex];
    if (patternToken === '*') {
      starIndex = patternIndex;
      starMatchIndex = tokenIndex;
      patternIndex += 1;
      continue;
    }
    if (patternToken !== undefined && tokens[tokenIndex] === patternToken) {
      tokenIndex += 1;
      patternIndex += 1;
      continue;
    }
    if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      starMatchIndex += 1;
      tokenIndex = starMatchIndex;
      continue;
    }
    return false;
  }

  while (patternIndex < patternTokens.length && patternTokens[patternIndex] === '*') {
    patternIndex += 1;
  }

  return patternIndex === patternTokens.length;
}

export function matchesCommandPattern(commandTokens: string[], pattern: string): boolean {
  const patternTokens = parseCommandPatternTokens(pattern);
  if (patternTokens.length === 0) {
    return false;
  }
  if (!patternTokens.includes('*') && patternTokens.length === 1) {
    patternTokens.push('*');
  } else if (patternTokens.includes('*') && patternTokens[patternTokens.length - 1] !== '*') {
    patternTokens.push('*');
  }
  return matchesTokenSequence(commandTokens, patternTokens);
}

export function matchesCommandPatterns(commandTokens: string[], patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some(pattern => matchesCommandPattern(commandTokens, pattern));
}

function normalizeFsMode(raw: string): FilesystemAccessMode | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'r' || trimmed === 'read') {
    return 'read';
  }
  if (trimmed === 'w' || trimmed === 'write' || trimmed === 'rw') {
    return 'write';
  }
  return null;
}

export function parseFsPatternEntry(raw: string): ParsedFsPattern | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'fs' || lower === 'filesystem') {
    return { mode: 'write', pattern: '**' };
  }
  if (!lower.startsWith('fs:')) {
    return null;
  }
  const rest = trimmed.slice(3);
  let modePart = rest;
  let pathPart = '';
  const separator = rest.indexOf(':');
  if (separator >= 0) {
    modePart = rest.slice(0, separator);
    pathPart = rest.slice(separator + 1);
  }
  const mode = normalizeFsMode(modePart);
  if (!mode) {
    return null;
  }
  const pattern = pathPart.trim() || '**';
  return { mode, pattern };
}

export function matchesFsPattern(
  targetPath: string,
  pattern: string,
  basePath: string,
  homeDir: string
): boolean {
  const normalizedPattern = normalizeFsPattern(pattern, basePath, homeDir);
  if (!normalizedPattern) {
    return false;
  }
  const normalizedTarget = toPosixPath(path.resolve(targetPath));
  return minimatch(normalizedTarget, normalizedPattern, {
    dot: true,
    nocase: process.platform === 'win32'
  });
}

function normalizeFsPattern(rawPattern: string, basePath: string, homeDir: string): string {
  let normalized = rawPattern.trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '~') {
    normalized = homeDir;
  } else if (normalized.startsWith('~/') || normalized.startsWith('~\\')) {
    normalized = path.join(homeDir, normalized.slice(2));
  } else if (normalized === '@base' || normalized === '@root') {
    normalized = basePath;
  } else if (normalized.startsWith('@base/')) {
    normalized = path.join(basePath, normalized.slice('@base/'.length));
  } else if (normalized.startsWith('@root/')) {
    normalized = path.join(basePath, normalized.slice('@root/'.length));
  } else if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  if (!path.isAbsolute(normalized)) {
    normalized = path.join(basePath, normalized);
  }

  return toPosixPath(path.resolve(normalized));
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}
