import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CURRENT_MANIFEST_VERSION = 1;
const DEFAULT_ARGS_PREVIEW_LIMIT = 160;
const DEFAULT_CACHE_ROOT = path.join('.mlld', 'checkpoints');
const RESULT_WRAPPER_VERSION = 1;

const MANIFEST_CORE_KEYS = new Set([
  'version',
  'scriptName',
  'scriptPath',
  'created',
  'lastUpdated',
  'totalCached',
  'totalSizeBytes',
  'forkedFrom'
]);

interface CheckpointManifest {
  version: number;
  scriptName: string;
  scriptPath?: string;
  created: string;
  lastUpdated: string;
  totalCached: number;
  totalSizeBytes: number;
  forkedFrom?: string;
  [key: string]: unknown;
}

interface CheckpointRecord {
  key: string;
  fn: string;
  argsHash: string;
  argsPreview: string;
  resultSize: number;
  ts: string;
  durationMs?: number;
}

interface StoredResultEnvelope {
  version: number;
  value: unknown;
}

export interface CheckpointManagerOptions {
  cacheRootDir?: string;
  scriptPath?: string;
  forkScriptName?: string;
  argsPreviewLimit?: number;
  now?: () => Date;
}

export interface CheckpointPutEntry {
  fn: string;
  args?: readonly unknown[];
  argsHash?: string;
  argsPreview?: string;
  result: unknown;
  ts?: string;
  durationMs?: number;
}

export interface CheckpointStats {
  scriptName: string;
  cacheDir: string;
  totalCached: number;
  totalSizeBytes: number;
  localCached: number;
  localSizeBytes: number;
  forkCached: number;
  forkSizeBytes: number;
  forkScriptName?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toIso(now: () => Date): string {
  return now().toISOString();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '[unserializable]';
  }
}

function normalizeForSerialization(value: unknown, seen: Map<object, number>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'undefined') {
    return { $type: 'undefined' };
  }

  if (typeof value === 'bigint') {
    return { $type: 'bigint', value: value.toString(10) };
  }

  if (typeof value === 'symbol') {
    return { $type: 'symbol', value: value.description ?? '' };
  }

  if (typeof value === 'function') {
    return { $type: 'function', value: value.name || 'anonymous' };
  }

  if (value instanceof Date) {
    return { $type: 'date', value: value.toISOString() };
  }

  if (value instanceof RegExp) {
    return { $type: 'regexp', value: value.toString() };
  }

  if (Buffer.isBuffer(value)) {
    return { $type: 'buffer', value: value.toString('base64') };
  }

  if (ArrayBuffer.isView(value)) {
    const arr = Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    return { $type: value.constructor.name, value: arr };
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeForSerialization(item, seen));
  }

  if (value instanceof Set) {
    const normalizedValues = Array.from(value.values()).map(item => normalizeForSerialization(item, seen));
    const sortable = normalizedValues.map(item => ({
      key: stableStringify(item),
      value: item
    }));
    sortable.sort((a, b) => a.key.localeCompare(b.key));
    return { $type: 'set', value: sortable.map(item => item.value) };
  }

  if (value instanceof Map) {
    const normalizedEntries = Array.from(value.entries()).map(([k, v]) => ({
      keyNorm: normalizeForSerialization(k, seen),
      valueNorm: normalizeForSerialization(v, seen)
    }));
    normalizedEntries.sort((a, b) => stableStringify(a.keyNorm).localeCompare(stableStringify(b.keyNorm)));
    return {
      $type: 'map',
      value: normalizedEntries.map(entry => [entry.keyNorm, entry.valueNorm])
    };
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return { $type: 'circular', value: seen.get(value) };
    }
    seen.set(value, seen.size + 1);

    const plain = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(plain).sort()) {
      normalized[key] = normalizeForSerialization(plain[key], seen);
    }
    return normalized;
  }

  return safeString(value);
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(normalizeForSerialization(value, new Map()));
  } catch {
    return safeString(value);
  }
}

function hashString(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeResultForStorage(value: unknown): unknown {
  return normalizeForSerialization(value, new Map());
}

function extractManifestExtras(manifest: CheckpointManifest): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (!MANIFEST_CORE_KEYS.has(key)) {
      extras[key] = value;
    }
  }
  return extras;
}

function keyToResultStem(key: string): string {
  if (key.startsWith('sha256:')) {
    const digest = key.slice('sha256:'.length);
    return `sha256-${digest.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }
  return key.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function parseCheckpointRecord(raw: unknown): CheckpointRecord | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  if (typeof raw.key !== 'string' || raw.key.length === 0) {
    return null;
  }
  if (typeof raw.fn !== 'string' || raw.fn.length === 0) {
    return null;
  }
  if (typeof raw.argsHash !== 'string' || raw.argsHash.length === 0) {
    return null;
  }
  if (typeof raw.argsPreview !== 'string') {
    return null;
  }
  if (typeof raw.ts !== 'string' || raw.ts.length === 0) {
    return null;
  }

  const resultSize =
    typeof raw.resultSize === 'number' && Number.isFinite(raw.resultSize) && raw.resultSize >= 0 ? raw.resultSize : 0;
  const durationMs =
    typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) ? raw.durationMs : undefined;

  return {
    key: raw.key,
    fn: raw.fn,
    argsHash: raw.argsHash,
    argsPreview: raw.argsPreview,
    resultSize,
    ts: raw.ts,
    ...(durationMs === undefined ? {} : { durationMs })
  };
}

export class CheckpointManager {
  static readonly CURRENT_MANIFEST_VERSION = CURRENT_MANIFEST_VERSION;

  static computeArgsHash(args: readonly unknown[]): string {
    return `sha256:${hashString(stableStringify(args))}`;
  }

  static computeCacheKey(functionName: string, args: readonly unknown[]): string {
    const payload = stableStringify({ fn: functionName, args });
    return `sha256:${hashString(payload)}`;
  }

  static buildArgsPreview(args: readonly unknown[], maxLength = DEFAULT_ARGS_PREVIEW_LIMIT): string {
    if (args.length === 0) {
      return '';
    }
    const first = args[0];
    let rendered: string;
    if (typeof first === 'string') {
      rendered = first;
    } else {
      rendered = stableStringify(first);
    }
    return truncate(rendered, maxLength);
  }

  private readonly scriptName: string;
  private readonly scriptPath?: string;
  private readonly forkScriptName?: string;
  private readonly argsPreviewLimit: number;
  private readonly now: () => Date;

  private readonly cacheRootDir: string;
  private readonly scriptDir: string;
  private readonly cacheIndexPath: string;
  private readonly manifestPath: string;
  private readonly resultsDir: string;

  private readonly forkScriptDir?: string;
  private readonly forkCacheIndexPath?: string;
  private readonly forkManifestPath?: string;
  private readonly forkResultsDir?: string;

  private loaded = false;
  private localIndex = new Map<string, CheckpointRecord>();
  private forkIndex = new Map<string, CheckpointRecord>();
  private localResultCache = new Map<string, unknown>();
  private forkResultCache = new Map<string, unknown>();
  private localManifestExtras: Record<string, unknown> = {};
  private localCreatedAt?: string;
  private forkSizeBytes = 0;
  private localSizeBytes = 0;

  constructor(scriptName: string, options: CheckpointManagerOptions = {}) {
    if (!scriptName || scriptName.trim().length === 0) {
      throw new Error('CheckpointManager requires a non-empty script name');
    }

    this.scriptName = scriptName;
    this.scriptPath = options.scriptPath;
    this.forkScriptName = options.forkScriptName;
    this.argsPreviewLimit = options.argsPreviewLimit ?? DEFAULT_ARGS_PREVIEW_LIMIT;
    this.now = options.now ?? (() => new Date());

    this.cacheRootDir = path.resolve(options.cacheRootDir ?? DEFAULT_CACHE_ROOT);
    this.scriptDir = path.join(this.cacheRootDir, this.scriptName);
    this.cacheIndexPath = path.join(this.scriptDir, 'llm-cache.jsonl');
    this.manifestPath = path.join(this.scriptDir, 'manifest.json');
    this.resultsDir = path.join(this.scriptDir, 'results');

    if (this.forkScriptName) {
      this.forkScriptDir = path.join(this.cacheRootDir, this.forkScriptName);
      this.forkCacheIndexPath = path.join(this.forkScriptDir, 'llm-cache.jsonl');
      this.forkManifestPath = path.join(this.forkScriptDir, 'manifest.json');
      this.forkResultsDir = path.join(this.forkScriptDir, 'results');
    }
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await mkdir(this.resultsDir, { recursive: true });
    await this.loadLocalManifest();
    await this.loadIndex(this.cacheIndexPath, this.localIndex);
    this.localSizeBytes = this.sumResultSizes(this.localIndex);

    if (this.forkScriptName && this.forkCacheIndexPath && this.forkManifestPath) {
      await this.loadForkManifestAndIndex();
      this.forkSizeBytes = this.sumResultSizes(this.forkIndex);
    }

    this.loaded = true;
  }

  async get(key: string): Promise<unknown | null> {
    await this.ensureLoaded();

    if (this.forkScriptName && this.forkResultsDir && this.forkIndex.has(key)) {
      return this.readCachedResult(key, this.forkResultCache, this.forkResultsDir);
    }

    if (!this.localIndex.has(key)) {
      return null;
    }
    return this.readCachedResult(key, this.localResultCache, this.resultsDir);
  }

  async put(key: string, entry: CheckpointPutEntry): Promise<void> {
    await this.ensureLoaded();
    if (!key || key.trim().length === 0) {
      throw new Error('Checkpoint key must be non-empty');
    }
    if (!entry.fn || entry.fn.trim().length === 0) {
      throw new Error('Checkpoint entry must include fn');
    }

    const ts = entry.ts ?? toIso(this.now);
    const args = entry.args ?? [];
    const argsHash = entry.argsHash ?? CheckpointManager.computeArgsHash(args);
    const argsPreview = truncate(
      entry.argsPreview ?? CheckpointManager.buildArgsPreview(args, this.argsPreviewLimit),
      this.argsPreviewLimit
    );

    const resultEnvelope: StoredResultEnvelope = {
      version: RESULT_WRAPPER_VERSION,
      value: normalizeResultForStorage(entry.result)
    };
    const resultJson = JSON.stringify(resultEnvelope);
    const resultSize = Buffer.byteLength(resultJson, 'utf8');
    const resultPath = this.getResultPath(this.resultsDir, key);

    await this.writeAtomic(resultPath, `${resultJson}\n`);

    const record: CheckpointRecord = {
      key,
      fn: entry.fn,
      argsHash,
      argsPreview,
      resultSize,
      ts,
      ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs })
    };

    this.localResultCache.set(key, resultEnvelope.value);
    this.localIndex.set(key, record);
    this.localSizeBytes = this.sumResultSizes(this.localIndex);

    await appendFile(this.cacheIndexPath, `${JSON.stringify(record)}\n`, 'utf8');
    await this.writeManifest();
  }

  async invalidateFunction(fnName: string): Promise<number> {
    await this.ensureLoaded();
    if (!fnName || fnName.trim().length === 0) {
      return 0;
    }
    const keys = Array.from(this.localIndex.values())
      .filter(entry => entry.fn === fnName)
      .map(entry => entry.key);
    return this.removeKeys(keys);
  }

  async invalidateFrom(pattern: string): Promise<number> {
    await this.ensureLoaded();
    const normalizedPattern = pattern.trim();
    if (!normalizedPattern) {
      return 0;
    }
    const keys = Array.from(this.localIndex.values())
      .filter(entry => entry.argsPreview.startsWith(normalizedPattern))
      .map(entry => entry.key);
    return this.removeKeys(keys);
  }

  async clear(): Promise<void> {
    await this.ensureLoaded();
    await rm(this.scriptDir, { recursive: true, force: true });
    await mkdir(this.resultsDir, { recursive: true });

    this.localIndex = new Map();
    this.localResultCache = new Map();
    this.localSizeBytes = 0;
    this.localManifestExtras = {};
    this.localCreatedAt = undefined;

    await this.rewriteCacheIndex();
    await this.writeManifest();
  }

  getStats(): CheckpointStats {
    const localCached = this.localIndex.size;
    const forkCached = this.forkIndex.size;
    return {
      scriptName: this.scriptName,
      cacheDir: this.scriptDir,
      totalCached: localCached + forkCached,
      totalSizeBytes: this.localSizeBytes + this.forkSizeBytes,
      localCached,
      localSizeBytes: this.localSizeBytes,
      forkCached,
      forkSizeBytes: this.forkSizeBytes,
      ...(this.forkScriptName ? { forkScriptName: this.forkScriptName } : {})
    };
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  private buildManifest(): CheckpointManifest {
    const nowIso = toIso(this.now);
    const manifest: CheckpointManifest = {
      ...this.localManifestExtras,
      version: CURRENT_MANIFEST_VERSION,
      scriptName: this.scriptName,
      ...(this.scriptPath ? { scriptPath: this.scriptPath } : {}),
      created: this.localCreatedAt ?? nowIso,
      lastUpdated: nowIso,
      totalCached: this.localIndex.size,
      totalSizeBytes: this.localSizeBytes,
      ...(this.forkScriptName ? { forkedFrom: this.forkScriptName } : {})
    };

    this.localCreatedAt = manifest.created;
    return manifest;
  }

  private async writeManifest(): Promise<void> {
    const manifest = this.buildManifest();
    await this.writeAtomic(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  private async loadLocalManifest(): Promise<void> {
    const raw = await this.readFileIfPresent(this.manifestPath);
    if (!raw) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (!isPlainObject(parsed) || typeof parsed.version !== 'number') {
      return;
    }

    const manifest = parsed as CheckpointManifest;
    if (manifest.version > CURRENT_MANIFEST_VERSION) {
      // Unknown future versions degrade to cold-cache behavior.
      return;
    }

    this.localManifestExtras = extractManifestExtras(manifest);
    const created = manifest.created;
    if (typeof created === 'string' && created.length > 0) {
      this.localCreatedAt = created;
    }
  }

  private async loadForkManifestAndIndex(): Promise<void> {
    if (!this.forkManifestPath || !this.forkCacheIndexPath) {
      return;
    }

    const manifestRaw = await this.readFileIfPresent(this.forkManifestPath);
    if (manifestRaw) {
      try {
        const parsed = JSON.parse(manifestRaw) as CheckpointManifest;
        if (typeof parsed?.version === 'number' && parsed.version > CURRENT_MANIFEST_VERSION) {
          // Unknown future versions degrade to cold-cache behavior.
          return;
        }
      } catch {
        // Invalid fork manifest should not break local cache behavior.
      }
    }

    await this.loadIndex(this.forkCacheIndexPath, this.forkIndex);
  }

  private async loadIndex(indexPath: string, index: Map<string, CheckpointRecord>): Promise<void> {
    const raw = await this.readFileIfPresent(indexPath);
    if (!raw) {
      return;
    }

    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const record = parseCheckpointRecord(parsed);
      if (!record) {
        continue;
      }
      index.set(record.key, record);
    }
  }

  private async removeKeys(keys: readonly string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    let removed = 0;
    for (const key of keys) {
      const deleted = this.localIndex.delete(key);
      this.localResultCache.delete(key);
      if (!deleted) {
        continue;
      }
      removed += 1;
      await rm(this.getResultPath(this.resultsDir, key), { force: true });
    }

    this.localSizeBytes = this.sumResultSizes(this.localIndex);
    await this.rewriteCacheIndex();
    await this.writeManifest();
    return removed;
  }

  private async rewriteCacheIndex(): Promise<void> {
    const rows = Array.from(this.localIndex.values())
      .map(entry => JSON.stringify(entry))
      .join('\n');
    const content = rows.length > 0 ? `${rows}\n` : '';
    await this.writeAtomic(this.cacheIndexPath, content);
  }

  private async readCachedResult(
    key: string,
    cache: Map<string, unknown>,
    resultsDir: string
  ): Promise<unknown | null> {
    if (cache.has(key)) {
      return cache.get(key) ?? null;
    }

    const resultPath = this.getResultPath(resultsDir, key);
    const raw = await this.readFileIfPresent(resultPath);
    if (!raw) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (isPlainObject(parsed) && parsed.version === RESULT_WRAPPER_VERSION && 'value' in parsed) {
      const value = (parsed as StoredResultEnvelope).value;
      cache.set(key, value);
      return value;
    }

    cache.set(key, parsed);
    return parsed;
  }

  private sumResultSizes(index: Map<string, CheckpointRecord>): number {
    let total = 0;
    for (const entry of index.values()) {
      total += entry.resultSize;
    }
    return total;
  }

  private getResultPath(baseResultsDir: string, key: string): string {
    return path.join(baseResultsDir, `${keyToResultStem(key)}.json`);
  }

  private async writeAtomic(targetPath: string, content: string): Promise<void> {
    const dir = path.dirname(targetPath);
    await mkdir(dir, { recursive: true });
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, content, 'utf8');
    try {
      await rename(tempPath, targetPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private async readFileIfPresent(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, 'utf8');
    } catch (error) {
      if (this.isMissingFileError(error)) {
        return null;
      }
      throw error;
    }
  }

  private isMissingFileError(error: unknown): boolean {
    if (!isPlainObject(error)) {
      return false;
    }
    return error.code === 'ENOENT';
  }
}
