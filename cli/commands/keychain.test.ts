import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { createKeychainCommand } from './keychain';

const mockProvider = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  list: vi.fn()
};

vi.mock('@core/resolvers/builtin/KeychainResolver', () => ({
  getKeychainProvider: () => mockProvider
}));

const originalCwd = process.cwd;
const tempDirs: string[] = [];

async function createProject(projectname?: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-keychain-'));
  tempDirs.push(root);
  const config = projectname === undefined ? {} : { projectname };
  await fs.writeFile(path.join(root, 'mlld-config.json'), JSON.stringify(config, null, 2));
  process.cwd = vi.fn(() => root);
  return root;
}

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

describe('keychain command', () => {
  it('adds an entry with --value', async () => {
    await createProject('demo');
    mockProvider.set.mockResolvedValue(undefined);

    const command = createKeychainCommand();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['add', 'ANTHROPIC_API_KEY'], { value: 'secret' });

    expect(mockProvider.set).toHaveBeenCalledWith('mlld-env-demo', 'ANTHROPIC_API_KEY', 'secret');
    consoleSpy.mockRestore();
  });

  it('removes an entry', async () => {
    await createProject('demo');
    mockProvider.delete.mockResolvedValue(undefined);

    const command = createKeychainCommand();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['rm', 'ANTHROPIC_API_KEY'], {});

    expect(mockProvider.delete).toHaveBeenCalledWith('mlld-env-demo', 'ANTHROPIC_API_KEY');
    consoleSpy.mockRestore();
  });

  it('lists entries', async () => {
    await createProject('demo');
    mockProvider.list.mockResolvedValue(['ONE', 'TWO']);

    const command = createKeychainCommand();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['list'], {});

    expect(mockProvider.list).toHaveBeenCalledWith('mlld-env-demo');
    expect(consoleSpy).toHaveBeenCalledWith('ONE');
    expect(consoleSpy).toHaveBeenCalledWith('TWO');
    consoleSpy.mockRestore();
  });

  it('prints entry value with get', async () => {
    await createProject('demo');
    mockProvider.get.mockResolvedValue('token-value');

    const command = createKeychainCommand();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['get', 'ANTHROPIC_API_KEY'], {});

    expect(mockProvider.get).toHaveBeenCalledWith('mlld-env-demo', 'ANTHROPIC_API_KEY');
    expect(consoleSpy).toHaveBeenCalledWith('token-value');
    consoleSpy.mockRestore();
  });

  it('imports entries from env file', async () => {
    const root = await createProject('demo');
    mockProvider.set.mockResolvedValue(undefined);

    const envPath = path.join(root, 'secrets.env');
    await fs.writeFile(envPath, 'FOO=bar\nBAZ="qux"\n# comment\n', 'utf8');

    const command = createKeychainCommand();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await command.execute(['import', 'secrets.env'], {});

    expect(mockProvider.set).toHaveBeenCalledWith('mlld-env-demo', 'FOO', 'bar');
    expect(mockProvider.set).toHaveBeenCalledWith('mlld-env-demo', 'BAZ', 'qux');
    consoleSpy.mockRestore();
  });

  it('requires projectname in config', async () => {
    await createProject();

    const command = createKeychainCommand();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    try {
      await command.execute(['list'], {});
    } catch (error: any) {
      if (!error.message.includes('exit:1')) {
        throw error;
      }
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes('projectname'))
    ).toBe(true);
  });
});
