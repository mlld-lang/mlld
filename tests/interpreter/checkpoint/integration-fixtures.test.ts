import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { interpret } from '@interpreter/index';
import { CheckpointManager } from '@interpreter/checkpoint/CheckpointManager';
import type { StructuredResult } from '@sdk/types';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

const CHECKPOINT_FIXTURE_ROOT = path.join(
  process.cwd(),
  'tests',
  'cases',
  'integration',
  'checkpoint'
);

const cleanupDirs: string[] = [];
const cleanupGlobals: string[] = [];

interface RunFixtureScriptOptions {
  source: string;
  checkpointRoot: string;
  scriptName: string;
  fileSystem?: MemoryFileSystem;
  fresh?: boolean;
  resume?: string | true;
  fork?: string;
  dynamicModules?: Record<string, string | Record<string, unknown>>;
}

async function readFixtureFile(...parts: string[]): Promise<string> {
  return readFile(path.join(CHECKPOINT_FIXTURE_ROOT, ...parts), 'utf8');
}

async function runFixtureScript(
  options: RunFixtureScriptOptions
): Promise<{ output: string; structured: StructuredResult; fileSystem: MemoryFileSystem }> {
  const fileSystem = options.fileSystem ?? new MemoryFileSystem();
  const result = await interpret(options.source, {
    mode: 'structured',
    mlldMode: 'strict',
    fileSystem,
    pathService: new PathService(),
    filePath: path.posix.join('/fixtures', `${options.scriptName}.mld`),
    checkpoint: true,
    checkpointScriptName: options.scriptName,
    checkpointCacheRootDir: options.checkpointRoot,
    ...(options.fresh === undefined ? {} : { fresh: options.fresh }),
    ...(options.resume === undefined ? {} : { resume: options.resume }),
    ...(options.fork ? { fork: options.fork } : {}),
    ...(options.dynamicModules ? { dynamicModules: options.dynamicModules } : {}),
    useMarkdownFormatter: false
  });

  if (typeof result === 'string') {
    throw new Error('Expected structured result for checkpoint fixture scenario');
  }

  return {
    output: String(result.output ?? '').trim(),
    structured: result,
    fileSystem
  };
}

function registerCounter(counterKey: string): void {
  cleanupGlobals.push(counterKey);
  (globalThis as Record<string, unknown>)[counterKey] = 0;
}

function readCounter(counterKey: string): number {
  return Number((globalThis as Record<string, unknown>)[counterKey] ?? 0);
}

function splitNonEmptyLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

async function readFixtureArtifact(
  fileSystem: MemoryFileSystem,
  ...candidates: string[]
): Promise<string> {
  for (const candidate of candidates) {
    try {
      return String(await fileSystem.readFile(candidate));
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(`Unable to read fixture artifact. Tried: ${candidates.join(', ')}`);
}

afterEach(async () => {
  for (const key of cleanupGlobals.splice(0)) {
    delete (globalThis as Record<string, unknown>)[key];
  }
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('checkpoint integration fixtures', () => {
  it('covers hooks + checkpoint miss/hit behavior with lifecycle visibility', async () => {
    const source = await readFixtureFile('hooks-ordering-visibility', 'example.md');
    const expected = (await readFixtureFile('hooks-ordering-visibility', 'expected.md')).trim();
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fixture-hooks-'));
    cleanupDirs.push(checkpointRoot);

    const counterKey = '__fixtureHooksCheckpointCounter';
    registerCounter(counterKey);

    const run = await runFixtureScript({
      source,
      checkpointRoot,
      scriptName: 'fixture-hooks-ordering-visibility',
      fresh: true
    });

    expect(run.output).toBe(expected);
    expect(readCounter(counterKey)).toBe(1);

    const hookLog = await readFixtureArtifact(
      run.fileSystem,
      '/fixtures/hooks-checkpoint.log',
      '/hooks-checkpoint.log'
    );

    expect(splitNonEmptyLines(hookLog)).toEqual([
      'hook|hit=false|fn=review',
      'hook|hit=true|fn=review'
    ]);
  });

  it('covers checkpoint + guards with guard bypass on cache hit', async () => {
    const source = await readFixtureFile('miss-hit-semantics', 'example.md');
    const expected = (await readFixtureFile('miss-hit-semantics', 'expected.md')).trim();
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fixture-guards-'));
    cleanupDirs.push(checkpointRoot);

    const counterKey = '__fixtureCheckpointGuardCounter';
    registerCounter(counterKey);
    const afterCounterKey = '__fixtureCheckpointGuardAfter';
    registerCounter(afterCounterKey);

    const run = await runFixtureScript({
      source,
      checkpointRoot,
      scriptName: 'fixture-miss-hit-semantics',
      fresh: true
    });

    expect(run.output).toBe(expected);
    expect(readCounter(counterKey)).toBe(1);
    expect(readCounter(afterCounterKey)).toBe(1);
  });

  it('covers resume targeting in parallel loops with fuzzy cursor invalidation', async () => {
    const source = await readFixtureFile('resume-fuzzy-targeting', 'example.md');
    const expected = (await readFixtureFile('resume-fuzzy-targeting', 'expected.md')).trim();
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fixture-resume-'));
    cleanupDirs.push(checkpointRoot);

    const counterKey = '__fixtureResumeFuzzyCounter';
    registerCounter(counterKey);

    const firstRun = await runFixtureScript({
      source,
      checkpointRoot,
      scriptName: 'fixture-resume-fuzzy-targeting',
      fresh: true
    });

    const resumeRun = await runFixtureScript({
      source,
      checkpointRoot,
      scriptName: 'fixture-resume-fuzzy-targeting',
      resume: '@process("bb.ts")'
    });

    expect(firstRun.output).toBe(expected);
    expect(resumeRun.output).toBe(expected);
    expect(readCounter(counterKey)).toBe(5);

    const manager = new CheckpointManager('fixture-resume-fuzzy-targeting', {
      cacheRootDir: checkpointRoot
    });
    await manager.load();
    expect(manager.getStats().localCached).toBe(3);
  });

  it('covers fork overlays with changed model/prompt arguments and read-only source cache', async () => {
    const sourceScript = await readFixtureFile('fork-hit-miss-overlay', 'source.mld');
    const sourceExpected = (await readFixtureFile('fork-hit-miss-overlay', 'expected.md')).trim();
    const targetScript = await readFixtureFile('fork-hit-miss-overlay', 'target.mld');
    const targetExpected = (await readFixtureFile('fork-hit-miss-overlay', 'expected-target.md')).trim();
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fixture-fork-'));
    cleanupDirs.push(checkpointRoot);

    const counterKey = '__fixtureForkOverlayCounter';
    registerCounter(counterKey);

    const sourceRun = await runFixtureScript({
      source: sourceScript,
      checkpointRoot,
      scriptName: 'fixture-fork-source',
      fresh: true
    });

    const targetRun = await runFixtureScript({
      source: targetScript,
      checkpointRoot,
      scriptName: 'fixture-fork-target',
      fork: 'fixture-fork-source',
      fresh: true
    });

    expect(sourceRun.output).toBe(sourceExpected);
    expect(targetRun.output).toBe(targetExpected);
    expect(readCounter(counterKey)).toBe(4);

    const sourceManager = new CheckpointManager('fixture-fork-source', {
      cacheRootDir: checkpointRoot
    });
    await sourceManager.load();
    expect(sourceManager.getStats().localCached).toBe(2);

    const modelMissKey = CheckpointManager.computeCacheKey('review', ['prompt-a', 'opus']);
    const promptMissKey = CheckpointManager.computeCacheKey('review', ['prompt-c', 'sonnet']);
    await expect(sourceManager.get(modelMissKey)).resolves.toBeNull();
    await expect(sourceManager.get(promptMissKey)).resolves.toBeNull();

    const targetManager = new CheckpointManager('fixture-fork-target', {
      cacheRootDir: checkpointRoot,
      forkScriptName: 'fixture-fork-source'
    });
    await targetManager.load();
    expect(targetManager.getStats().localCached).toBe(2);
    expect(targetManager.getStats().forkCached).toBe(2);
  });

  it('covers hook observability emissions with state:// + append + non-fatal run errors', async () => {
    const source = await readFixtureFile('hooks-state-emission-nonfatal', 'example.md');
    const expected = (await readFixtureFile('hooks-state-emission-nonfatal', 'expected.md')).trim();
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-fixture-observability-'));
    cleanupDirs.push(checkpointRoot);

    const counterKey = '__fixtureHookObservabilityCounter';
    registerCounter(counterKey);

    const run = await runFixtureScript({
      source,
      checkpointRoot,
      scriptName: 'fixture-hooks-state-emission-nonfatal',
      fresh: true,
      dynamicModules: {
        '@state': {}
      }
    });

    expect(run.output).toBe(expected);
    expect(readCounter(counterKey)).toBe(1);

    const telemetryWrites = run.structured.stateWrites.filter(write => write.path === 'telemetry');
    expect(telemetryWrites).toHaveLength(1);
    expect(String(telemetryWrites[0].value)).toContain('telemetry:emit:false');

    const observabilityLog = await readFixtureArtifact(
      run.fileSystem,
      '/fixtures/hooks-observability.log',
      '/hooks-observability.log'
    );
    const logLines = splitNonEmptyLines(observabilityLog);
    expect(logLines[0]).toBe('append:emit');
    const errorsLine = logLines.find(line => line.startsWith('errors:'));
    expect(errorsLine).toBeDefined();
    const errorCount = Number((errorsLine ?? 'errors:0').split(':')[1]);
    expect(errorCount).toBeGreaterThanOrEqual(1);
  });
});
