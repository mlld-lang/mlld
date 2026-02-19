import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CheckpointManager,
  type CheckpointManagerOptions
} from '@interpreter/checkpoint/CheckpointManager';

const cleanupDirs: string[] = [];
const FIXED_NOW = new Date('2026-02-19T00:00:00.000Z');

function createOptions(root: string, overrides: Partial<CheckpointManagerOptions> = {}): CheckpointManagerOptions {
  return {
    cacheRootDir: root,
    now: () => FIXED_NOW,
    ...overrides
  };
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('CheckpointManager', () => {
  it('computes deterministic keys and remains stable with serialization fallback', () => {
    const args = ['review src/a.ts', { model: 'sonnet', temperature: 0.2 }];
    const a = CheckpointManager.computeCacheKey('claudePoll', args);
    const b = CheckpointManager.computeCacheKey('claudePoll', args);
    const c = CheckpointManager.computeCacheKey('claudePoll', ['review src/a.ts', { model: 'opus' }]);

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('sha256:')).toBe(true);

    const circular: { self?: unknown; label: string } = { label: 'x' };
    circular.self = circular;
    const circularKey = CheckpointManager.computeCacheKey('circular', [circular]);
    expect(circularKey.startsWith('sha256:')).toBe(true);
  });

  it('writes and reads cache entries with manifest + disk layout', async () => {
    const root = await createTempDir('checkpoint-manager-roundtrip-');
    const manager = new CheckpointManager('pipeline', createOptions(root));
    await manager.load();

    const key = CheckpointManager.computeCacheKey('claudePoll', ['review src/a.ts', 'sonnet']);
    await manager.put(key, {
      fn: 'claudePoll',
      args: ['review src/a.ts', 'sonnet'],
      result: { text: 'ok' },
      durationMs: 1234
    });

    await expect(manager.get(key)).resolves.toEqual({ text: 'ok' });

    const scriptDir = path.join(root, 'pipeline');
    const cacheFile = path.join(scriptDir, 'llm-cache.jsonl');
    const manifestFile = path.join(scriptDir, 'manifest.json');
    const resultFile = path.join(scriptDir, 'results', `${key.replace(':', '-')}.json`);

    const cacheRaw = await readFile(cacheFile, 'utf8');
    expect(cacheRaw).toContain('"fn":"claudePoll"');
    expect(cacheRaw).toContain(`"key":"${key}"`);

    const manifestRaw = await readFile(manifestFile, 'utf8');
    const manifest = JSON.parse(manifestRaw) as { version: number; totalCached: number; totalSizeBytes: number };
    expect(manifest.version).toBe(1);
    expect(manifest.totalCached).toBe(1);
    expect(manifest.totalSizeBytes).toBeGreaterThan(0);

    const resultRaw = await readFile(resultFile, 'utf8');
    expect(resultRaw).toContain('"version":1');
  });

  it('reloads cached entries from disk', async () => {
    const root = await createTempDir('checkpoint-manager-reload-');
    const first = new CheckpointManager('pipeline', createOptions(root));
    await first.load();

    const key = CheckpointManager.computeCacheKey('claudePoll', ['review src/a.ts', 'sonnet']);
    await first.put(key, {
      fn: 'claudePoll',
      args: ['review src/a.ts', 'sonnet'],
      result: { text: 'persisted' }
    });

    const second = new CheckpointManager('pipeline', createOptions(root));
    await second.load();

    await expect(second.get(key)).resolves.toEqual({ text: 'persisted' });
    expect(second.getStats().localCached).toBe(1);
  });

  it('invalidates entries by function and fuzzy argsPreview prefix', async () => {
    const root = await createTempDir('checkpoint-manager-invalidate-');
    const manager = new CheckpointManager('pipeline', createOptions(root));
    await manager.load();

    const keyA = CheckpointManager.computeCacheKey('processFiles', ['tests/cases/docs/a.ts', 'sonnet']);
    const keyB = CheckpointManager.computeCacheKey('processFiles', ['tests/cases/app/a.ts', 'sonnet']);
    const keyC = CheckpointManager.computeCacheKey('summarize', ['tests/cases/docs/a.ts', 'opus']);

    await manager.put(keyA, {
      fn: 'processFiles',
      args: ['tests/cases/docs/a.ts', 'sonnet'],
      result: 'A'
    });
    await manager.put(keyB, {
      fn: 'processFiles',
      args: ['tests/cases/app/a.ts', 'sonnet'],
      result: 'B'
    });
    await manager.put(keyC, {
      fn: 'summarize',
      args: ['tests/cases/docs/a.ts', 'opus'],
      result: 'C'
    });

    await expect(manager.invalidateFunction('summarize')).resolves.toBe(1);
    await expect(manager.get(keyC)).resolves.toBeNull();
    await expect(manager.get(keyA)).resolves.toBe('A');

    await expect(manager.invalidateFrom('tests/cases/docs')).resolves.toBe(1);
    await expect(manager.get(keyA)).resolves.toBeNull();
    await expect(manager.get(keyB)).resolves.toBe('B');
  });

  it('supports exact and prefix named checkpoint invalidation', async () => {
    const root = await createTempDir('checkpoint-manager-named-prefix-');
    const manager = new CheckpointManager('pipeline', createOptions(root));
    await manager.load();

    await manager.registerNamedCheckpoint('data');
    await manager.registerNamedCheckpoint('data-processing');
    await manager.registerNamedCheckpoint('review');

    await expect(manager.invalidateFromNamedCheckpoint('review')).resolves.toBe(0);
    await expect(manager.invalidateFromNamedCheckpoint('data-pro')).resolves.toBe(0);
    await expect(manager.invalidateFromNamedCheckpoint('data')).resolves.toBe(0);
  });

  it('errors with candidate list for ambiguous named checkpoint prefixes', async () => {
    const root = await createTempDir('checkpoint-manager-named-ambiguous-');
    const manager = new CheckpointManager('pipeline', createOptions(root));
    await manager.load();

    await manager.registerNamedCheckpoint('data-collection-complete');
    await manager.registerNamedCheckpoint('data-processing-complete');

    await expect(manager.invalidateFromNamedCheckpoint('data')).rejects.toThrow(
      'Ambiguous checkpoint match "data"'
    );
  });

  it('clears local cache state for fresh runs', async () => {
    const root = await createTempDir('checkpoint-manager-clear-');
    const manager = new CheckpointManager('pipeline', createOptions(root));
    await manager.load();

    const key = CheckpointManager.computeCacheKey('claudePoll', ['review src/a.ts', 'sonnet']);
    await manager.put(key, {
      fn: 'claudePoll',
      args: ['review src/a.ts', 'sonnet'],
      result: 'cached'
    });
    expect(manager.getStats().localCached).toBe(1);

    await manager.clear();
    await expect(manager.get(key)).resolves.toBeNull();
    expect(manager.getStats().localCached).toBe(0);
    expect(manager.getStats().totalCached).toBe(0);
  });

  it('tolerates malformed JSONL lines while preserving valid entries', async () => {
    const root = await createTempDir('checkpoint-manager-corrupt-');
    const scriptDir = path.join(root, 'pipeline');
    const resultsDir = path.join(scriptDir, 'results');
    await mkdir(resultsDir, { recursive: true });

    const keyA = CheckpointManager.computeCacheKey('claudePoll', ['a', 'sonnet']);
    const keyB = CheckpointManager.computeCacheKey('claudePoll', ['b', 'sonnet']);

    const lineA = JSON.stringify({
      key: keyA,
      fn: 'claudePoll',
      argsHash: CheckpointManager.computeArgsHash(['a', 'sonnet']),
      argsPreview: 'a',
      resultSize: 16,
      ts: '2026-02-19T00:00:00.000Z'
    });
    const lineB = JSON.stringify({
      key: keyB,
      fn: 'claudePoll',
      argsHash: CheckpointManager.computeArgsHash(['b', 'sonnet']),
      argsPreview: 'b',
      resultSize: 16,
      ts: '2026-02-19T00:00:00.000Z'
    });

    await writeFile(
      path.join(scriptDir, 'llm-cache.jsonl'),
      `${lineA}\n{bad json}\n{"missing":"required-fields"}\n${lineB}\n`,
      'utf8'
    );
    await writeFile(path.join(scriptDir, 'manifest.json'), JSON.stringify({ version: 1 }), 'utf8');
    await writeFile(path.join(resultsDir, `${keyA.replace(':', '-')}.json`), JSON.stringify({ version: 1, value: 'A' }), 'utf8');
    await writeFile(path.join(resultsDir, `${keyB.replace(':', '-')}.json`), JSON.stringify({ version: 1, value: 'B' }), 'utf8');

    const manager = new CheckpointManager('pipeline', createOptions(root));
    await manager.load();

    await expect(manager.get(keyA)).resolves.toBe('A');
    await expect(manager.get(keyB)).resolves.toBe('B');
    expect(manager.getStats().localCached).toBe(2);
  });

  it('reads from fork source cache without writing into the source script', async () => {
    const root = await createTempDir('checkpoint-manager-fork-');

    const source = new CheckpointManager('collect', createOptions(root));
    await source.load();
    const forkHitKey = CheckpointManager.computeCacheKey('claudePoll', ['shared prompt', 'sonnet']);
    await source.put(forkHitKey, {
      fn: 'claudePoll',
      args: ['shared prompt', 'sonnet'],
      result: { text: 'from-source' }
    });

    const forked = new CheckpointManager(
      'analyze',
      createOptions(root, {
        forkScriptName: 'collect'
      })
    );
    await forked.load();

    await expect(forked.get(forkHitKey)).resolves.toEqual({ text: 'from-source' });
    expect(forked.getStats().forkCached).toBe(1);

    const localOnlyKey = CheckpointManager.computeCacheKey('claudePoll', ['local prompt', 'opus']);
    await forked.put(localOnlyKey, {
      fn: 'claudePoll',
      args: ['local prompt', 'opus'],
      result: { text: 'local-only' }
    });

    const sourceReload = new CheckpointManager('collect', createOptions(root));
    await sourceReload.load();
    await expect(sourceReload.get(localOnlyKey)).resolves.toBeNull();
    await expect(sourceReload.get(forkHitKey)).resolves.toEqual({ text: 'from-source' });

    const sourceCacheRaw = await readFile(path.join(root, 'collect', 'llm-cache.jsonl'), 'utf8');
    expect(sourceCacheRaw.trim().split('\n')).toHaveLength(1);
  });

  it('invalidates forked entries in memory across all resume selector paths', async () => {
    const root = await createTempDir('checkpoint-manager-fork-invalidate-');

    const source = new CheckpointManager('collect', createOptions(root));
    await source.load();

    const siteZeroKey = CheckpointManager.computeCacheKey('llm', ['alpha', 'sonnet']);
    const siteOneFirstKey = CheckpointManager.computeCacheKey('llm', ['beta', 'sonnet']);
    const siteOneSecondKey = CheckpointManager.computeCacheKey('llm', ['charlie', 'sonnet']);
    const otherFnKey = CheckpointManager.computeCacheKey('summarize', ['alpha-notes', 'opus']);

    await source.put(siteZeroKey, {
      fn: 'llm',
      args: ['alpha', 'sonnet'],
      result: 'site-0',
      invocationSite: 'script:1',
      invocationIndex: 0,
      invocationOrdinal: 0
    });
    await source.put(siteOneFirstKey, {
      fn: 'llm',
      args: ['beta', 'sonnet'],
      result: 'site-1-first',
      invocationSite: 'script:2',
      invocationIndex: 1,
      invocationOrdinal: 1
    });
    await source.put(siteOneSecondKey, {
      fn: 'llm',
      args: ['charlie', 'sonnet'],
      result: 'site-1-second',
      invocationSite: 'script:2',
      invocationIndex: 1,
      invocationOrdinal: 2
    });
    await source.put(otherFnKey, {
      fn: 'summarize',
      args: ['alpha-notes', 'opus'],
      result: 'other-fn'
    });

    const forked = new CheckpointManager(
      'analyze',
      createOptions(root, {
        forkScriptName: 'collect'
      })
    );
    await forked.load();

    expect(forked.getStats().forkCached).toBe(4);

    await expect(forked.invalidateFunctionSite('llm', 1)).resolves.toBe(2);
    await expect(forked.get(siteOneFirstKey)).resolves.toBeNull();
    await expect(forked.get(siteOneSecondKey)).resolves.toBeNull();
    expect(forked.getStats().forkCached).toBe(2);

    await expect(forked.invalidateFunctionFrom('llm', 'alpha')).resolves.toBe(1);
    await expect(forked.get(siteZeroKey)).resolves.toBeNull();
    expect(forked.getStats().forkCached).toBe(1);

    await expect(forked.invalidateFrom('alpha')).resolves.toBe(1);
    await expect(forked.get(otherFnKey)).resolves.toBeNull();
    expect(forked.getStats().forkCached).toBe(0);

    const reloaded = new CheckpointManager(
      'analyze',
      createOptions(root, {
        forkScriptName: 'collect'
      })
    );
    await reloaded.load();
    expect(reloaded.getStats().forkCached).toBe(4);

    await expect(reloaded.invalidateFunction('summarize')).resolves.toBe(1);
    await expect(reloaded.get(otherFnKey)).resolves.toBeNull();
    expect(reloaded.getStats().forkCached).toBe(3);
  });
});
