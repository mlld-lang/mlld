import path from 'node:path';

function stripCheckpointScriptSuffix(baseName: string): string {
  if (baseName.endsWith('.mld.md')) {
    return baseName.slice(0, -'.mld.md'.length);
  }
  if (baseName.endsWith('.mld')) {
    return baseName.slice(0, -'.mld'.length);
  }
  return baseName;
}

export function resolveCheckpointScriptName(
  filePath?: string,
  explicitName?: string
): string | undefined {
  if (typeof explicitName === 'string' && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  if (!filePath || typeof filePath !== 'string') {
    return undefined;
  }

  const parsed = path.parse(filePath);
  const normalizedBase = parsed.base.toLowerCase();
  if (
    normalizedBase === 'index.mld' ||
    normalizedBase === 'main.mld' ||
    normalizedBase === 'index.mld.md' ||
    normalizedBase === 'main.mld.md'
  ) {
    const dirName = path.basename(parsed.dir);
    if (dirName && dirName !== path.sep) {
      return dirName;
    }
  }

  const candidate = stripCheckpointScriptSuffix(parsed.base).trim();
  return candidate.length > 0 ? candidate : undefined;
}

export function resolveCheckpointScriptCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const derived = resolveCheckpointScriptName(trimmed);
  if (derived && derived !== trimmed) {
    candidates.add(derived);
  }

  return Array.from(candidates);
}
