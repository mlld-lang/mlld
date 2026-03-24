import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SigService } from '@core/security';
import { signCommand } from './sign';

describe('signCommand', () => {
  let root: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'mlld-sign-'));
    await writeFile(path.join(root, 'package.json'), '{}');
    await mkdir(path.join(root, 'docs'), { recursive: true });
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it('signs matched files with the provided user identity', async () => {
    await Promise.all([
      writeFile(path.join(root, 'docs', 'a.md'), 'alpha'),
      writeFile(path.join(root, 'docs', 'b.md'), 'beta')
    ]);

    await signCommand({
      basePath: root,
      patterns: ['docs/*.md'],
      identity: 'user:tester'
    });

    const service = new SigService(root);
    await expect(service.verify(path.join(root, 'docs', 'a.md'))).resolves.toMatchObject({
      status: 'verified',
      signer: 'user:tester'
    });
    await expect(service.verify(path.join(root, 'docs', 'b.md'))).resolves.toMatchObject({
      status: 'verified',
      signer: 'user:tester'
    });
    expect(logSpy).toHaveBeenCalledWith('Signed 2 files as user:tester');
  });

  it('reports the previous signer when a file is re-signed', async () => {
    const filePath = path.join(root, 'docs', 'note.md');
    await writeFile(filePath, 'hello');

    await signCommand({
      basePath: root,
      patterns: ['docs/note.md'],
      identity: 'user:first'
    });
    logSpy.mockClear();

    await signCommand({
      basePath: root,
      patterns: ['docs/note.md'],
      identity: 'user:second'
    });

    expect(logSpy).toHaveBeenCalledWith('Signed 1 file as user:second');
    expect(logSpy).toHaveBeenCalledWith('  docs/note.md (was user:first)');
  });
});
