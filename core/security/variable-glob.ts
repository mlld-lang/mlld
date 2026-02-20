import { Minimatch } from 'minimatch';

function normalizeVariableName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

function normalizePattern(pattern: string): string | null {
  if (typeof pattern !== 'string') {
    return null;
  }
  const trimmed = pattern.trim();
  if (!trimmed) {
    return null;
  }
  return normalizeVariableName(trimmed);
}

export function compileVariablePattern(pattern: string): Minimatch | null {
  const normalized = normalizePattern(pattern);
  if (!normalized) {
    return null;
  }
  return new Minimatch(normalized, { dot: true });
}

export function matchesVariablePattern(name: string, pattern: string): boolean {
  const matcher = compileVariablePattern(pattern);
  if (!matcher) {
    return false;
  }
  return matcher.match(normalizeVariableName(name));
}

export function matchesAnyVariablePattern(name: string, patterns: string[]): boolean {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  const normalized = normalizeVariableName(name);
  for (const pattern of patterns) {
    const matcher = compileVariablePattern(pattern);
    if (matcher?.match(normalized)) {
      return true;
    }
  }
  return false;
}
