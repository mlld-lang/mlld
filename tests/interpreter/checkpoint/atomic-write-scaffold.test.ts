import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface AtomicWriteIo {
  writeFile: (filePath: string, content: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  rm: (filePath: string) => Promise<void>;
}

async function writeAtomic(
  targetPath: string,
  content: string,
  io: AtomicWriteIo,
  tempSuffix = 'tmp'
): Promise<void> {
  const tempPath = `${targetPath}.${tempSuffix}`;
  await io.writeFile(tempPath, content);
  try {
    await io.rename(tempPath, targetPath);
  } catch (error) {
    await io.rm(tempPath);
    throw error;
  }
}

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('checkpoint atomic write scaffold', () => {
  it('commits content by temp-write then rename', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-atomic-success-'));
    cleanupDirs.push(dir);
    const target = path.join(dir, 'manifest.json');

    const realIo: AtomicWriteIo = {
      writeFile: async (filePath, value) => writeFile(filePath, value, 'utf8'),
      rename: async (from, to) => {
        const fs = await import('node:fs/promises');
        await fs.rename(from, to);
      },
      rm: async (filePath) => rm(filePath, { force: true })
    };

    await writeAtomic(target, '{"version":1}', realIo, 'phase05');
    expect(await readFile(target, 'utf8')).toBe('{"version":1}');
  });

  it('cleans temp files and preserves prior target on rename failure', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'checkpoint-atomic-failure-'));
    cleanupDirs.push(dir);
    const target = path.join(dir, 'manifest.json');
    await writeFile(target, '{"version":1,"state":"old"}', 'utf8');

    const removed: string[] = [];
    const failingIo: AtomicWriteIo = {
      writeFile: async (filePath, value) => writeFile(filePath, value, 'utf8'),
      rename: async () => {
        throw new Error('rename-failed');
      },
      rm: async filePath => {
        removed.push(filePath);
        await rm(filePath, { force: true });
      }
    };

    await expect(
      writeAtomic(target, '{"version":1,"state":"new"}', failingIo, 'phase05-fail')
    ).rejects.toThrow('rename-failed');

    expect(await readFile(target, 'utf8')).toBe('{"version":1,"state":"old"}');
    expect(removed).toEqual([`${target}.phase05-fail`]);
  });
});
