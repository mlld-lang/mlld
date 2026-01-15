import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { envCommand } from './env';

const originalCwd = process.cwd;

describe('envCommand', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    process.cwd = originalCwd;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('rejects invalid environment names', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await envCommand({ _: ['spawn', '..', '--', 'echo', 'test'] });
    } catch (error: any) {
      if (!error.message.includes('exit:1')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes('Environment name'))
    ).toBe(true);
  });

  it('rejects modules that are not environment modules', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-env-test-'));
    tempDirs.push(root);
    process.cwd = vi.fn(() => root);

    const envDir = path.join(root, '.mlld/env/bad-env');
    await fs.mkdir(envDir, { recursive: true });
    await fs.writeFile(
      path.join(envDir, 'module.yml'),
      'name: bad-env\ntype: tool\n',
      'utf8'
    );

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await envCommand({ _: ['spawn', 'bad-env', '--', 'echo', 'test'] });
    } catch (error: any) {
      if (!error.message.includes('exit:1')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        String(call[0]).includes("Module 'bad-env' is not an environment module.")
      )
    ).toBe(true);
  });

  it('invokes @spawn export from environment module', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-env-spawn-'));
    tempDirs.push(root);
    process.cwd = vi.fn(() => root);

    const envDir = path.join(root, '.mlld/env/good-env');
    await fs.mkdir(envDir, { recursive: true });
    await fs.writeFile(
      path.join(envDir, 'module.yml'),
      'name: good-env\ntype: environment\nentry: index.mld\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(envDir, 'index.mld'),
      [
        '/exe @spawn(cmd) = `spawned @cmd`',
        '',
        '/export { @spawn }'
      ].join('\n'),
      'utf8'
    );

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await envCommand({ _: ['spawn', 'good-env', '--', 'hello'] });
    } catch (error: any) {
      if (!error.message.includes('exit:0')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
