import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createCheckpointCommand } from './checkpoint';

const cleanupDirs: string[] = [];

async function createCheckpointFixture(
  root: string,
  scriptName: string
): Promise<{ scriptDir: string }> {
  const scriptDir = path.join(root, '.mlld', 'checkpoints', scriptName);
  const resultsDir = path.join(scriptDir, 'results');
  await mkdir(resultsDir, { recursive: true });
  await writeFile(
    path.join(scriptDir, 'llm-cache.jsonl'),
    [
      JSON.stringify({
        key: 'sha256:aaa',
        fn: 'review',
        argsPreview: 'src/a.ts',
        ts: '2026-02-19T00:00:00.000Z',
        resultSize: 10
      }),
      JSON.stringify({
        key: 'sha256:bbb',
        fn: 'review',
        argsPreview: 'src/b.ts',
        ts: '2026-02-19T00:01:00.000Z',
        resultSize: 11
      })
    ].join('\n') + '\n',
    'utf8'
  );
  await writeFile(
    path.join(scriptDir, 'manifest.json'),
    JSON.stringify({
      version: 1,
      scriptName,
      totalCached: 2
    }),
    'utf8'
  );
  return { scriptDir };
}

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('checkpoint command', () => {
  it('lists cached entries for a script', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mlld-checkpoint-list-'));
    cleanupDirs.push(root);
    await createCheckpointFixture(root, 'pipeline');

    const command = createCheckpointCommand();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['list', 'pipeline'], { 'base-path': root });

    const output = logSpy.mock.calls.map(call => String(call[0])).join('\n');
    expect(output).toContain('Checkpoint entries for pipeline');
    expect(output).toContain('review | src/a.ts | sha256:aaa');
    expect(output).toContain('Total: 2');
  });

  it('inspects checkpoint manifest and records', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mlld-checkpoint-inspect-'));
    cleanupDirs.push(root);
    await createCheckpointFixture(root, 'pipeline');

    const command = createCheckpointCommand();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['inspect', 'pipeline'], { 'base-path': root });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? '{}')) as {
      script?: string;
      manifest?: { totalCached?: number };
      records?: Array<{ key: string }>;
    };
    expect(payload.script).toBe('pipeline');
    expect(payload.manifest?.totalCached).toBe(2);
    expect(payload.records?.map(record => record.key)).toEqual(['sha256:aaa', 'sha256:bbb']);
  });

  it('cleans script cache directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mlld-checkpoint-clean-'));
    cleanupDirs.push(root);
    const { scriptDir } = await createCheckpointFixture(root, 'pipeline');

    const command = createCheckpointCommand();
    await command.execute(['clean', 'pipeline'], { 'base-path': root });

    await expect(readFile(path.join(scriptDir, 'manifest.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
