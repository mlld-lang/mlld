import type { MlldMode } from '@core/types/mode';

const DEFAULT_FALLBACK_MODE: MlldMode = 'markdown';

export function inferMlldMode(filePath?: string, fallback: MlldMode = DEFAULT_FALLBACK_MODE): MlldMode {
  if (!filePath) return fallback;

  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.mld.md')) return 'markdown';
  if (normalized.endsWith('.mld')) return 'strict';
  if (normalized.endsWith('.md')) return 'markdown';

  return fallback;
}

export function resolveMlldMode(
  explicitMode?: MlldMode,
  filePath?: string,
  fallback: MlldMode = DEFAULT_FALLBACK_MODE
): MlldMode {
  if (explicitMode) return explicitMode;

  const strictEnv = process.env.MLLD_STRICT;
  if (strictEnv !== undefined) {
    const normalized = strictEnv.toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'strict') {
      return inferMlldMode(filePath, 'strict');
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'markdown' || normalized === 'md' || normalized === 'loose') {
      return 'markdown';
    }
  }

  return inferMlldMode(filePath, fallback);
}
