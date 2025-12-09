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

  const looseFlag = process.env.LOOSE_TESTMODE;
  const looseEnabled = looseFlag === '1' || looseFlag === 'true';
  const looseDefault = looseFlag === undefined ? process.env.NODE_ENV === 'test' : looseEnabled;
  if (looseDefault) return 'markdown';

  return inferMlldMode(filePath, fallback);
}
