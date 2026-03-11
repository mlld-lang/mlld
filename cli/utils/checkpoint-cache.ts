import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { resolveCheckpointScriptName } from '@interpreter/checkpoint/script-name';

type CheckpointRunOptions = {
  noCheckpoint?: boolean;
  fresh?: boolean;
  resume?: string | true;
  fork?: string;
};

type CheckpointSummary = {
  scriptName: string;
  cachedCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function readFileIfPresent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function parseIndexCount(raw: string | null): number {
  if (!raw) {
    return 0;
  }

  let count = 0;
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsed)) {
        continue;
      }
      if (typeof parsed.key === 'string' && typeof parsed.fn === 'string') {
        count += 1;
      }
    } catch {
      // Ignore malformed lines and treat as non-entry data.
    }
  }

  return count;
}

function readManifestCount(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    if (typeof parsed.totalCached === 'number' && Number.isInteger(parsed.totalCached) && parsed.totalCached >= 0) {
      return parsed.totalCached;
    }
  } catch {
    // Fall back to index parsing.
  }
  return null;
}

function shouldReadCheckpoints(options: CheckpointRunOptions): boolean {
  if (options.resume !== undefined) {
    return true;
  }
  return typeof options.fork === 'string' && options.fork.trim().length > 0;
}

export function shouldShowCheckpointResumeHint(options: CheckpointRunOptions): boolean {
  if (options.noCheckpoint === true || options.fresh === true) {
    return false;
  }
  return !shouldReadCheckpoints(options);
}

export async function getCheckpointSummaryByScriptName(
  cacheRootDir: string,
  scriptName: string
): Promise<CheckpointSummary | null> {
  const normalizedScriptName = scriptName.trim();
  if (!normalizedScriptName) {
    return null;
  }

  const scriptDir = path.join(cacheRootDir, normalizedScriptName);
  if (!existsSync(scriptDir)) {
    return null;
  }

  const manifestPath = path.join(scriptDir, 'manifest.json');
  const cacheIndexPath = path.join(scriptDir, 'llm-cache.jsonl');
  const [manifestRaw, indexRaw] = await Promise.all([
    readFileIfPresent(manifestPath),
    readFileIfPresent(cacheIndexPath)
  ]);

  const manifestCount = readManifestCount(manifestRaw);
  const cachedCount = manifestCount ?? parseIndexCount(indexRaw);
  if (cachedCount <= 0) {
    return null;
  }

  return {
    scriptName: normalizedScriptName,
    cachedCount
  };
}

export async function getCheckpointSummaryByFilePath(
  cacheRootDir: string,
  filePath: string
): Promise<CheckpointSummary | null> {
  const scriptName = resolveCheckpointScriptName(filePath);
  if (!scriptName) {
    return null;
  }
  return getCheckpointSummaryByScriptName(cacheRootDir, scriptName);
}

export function formatCheckpointResumeHint(
  target: 'file' | 'script',
  cachedCount: number
): string {
  const noun = cachedCount === 1 ? 'cached entry' : 'cached entries';
  return `Checkpoint found for this ${target} (${cachedCount} ${noun}). Use --resume to continue from where you left off.`;
}
