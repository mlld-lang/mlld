import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InstallCommand, installCommand } from './install';
import * as path from 'path';
import * as fs from 'fs/promises';
import { formatModuleReference } from '../utils/output';
import { getCommandContext } from '../utils/command-context';

vi.mock('../utils/command-context', () => ({
  getCommandContext: vi.fn()
}));

describe('InstallCommand', () => {
  let tempDir: string;
  let installCmd: InstallCommand;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-install-'));
    installCmd = new InstallCommand(tempDir, { verbose: false });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should create install command instance', () => {
    expect(installCmd).toBeDefined();
  });

  it('should handle empty module list (install from lock)', async () => {
    // This test would verify the install from lock file functionality
    // For now, we'll just test that it doesn't crash
    await expect(installCmd.install([], { dryRun: true })).resolves.toBeUndefined();
  });

  it('should handle specific module installation', async () => {
    // Test installing specific modules
    const modules = ['@alice/utils', '@bob/helpers'];
    
    await expect(installCmd.install(modules, { dryRun: true })).resolves.toBeUndefined();
  }, 15000);

  it('should validate module references', () => {
    // Test module reference parsing
    const validRefs = [
      '@alice/utils',
      'alice/utils',
      '@alice/utils@v1.0.0',
      'alice/utils@abc123'
    ];

    for (const ref of validRefs) {
      expect(() => {
        const parsed = formatModuleReference(ref);
        expect(parsed.username).toBeTruthy();
        expect(parsed.moduleName).toBeTruthy();
      }).not.toThrow();
    }
  });

  it('shows cached install confirmation with import guidance for direct modules', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      logs.push(value === undefined ? '' : String(value));
    });

    try {
      await (installCmd as any).report(
        [
          {
            module: '@mlld/claude-poll',
            status: 'cached',
            version: '1.2.0',
            isDirect: true
          }
        ],
        {},
        []
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.some(line => line.includes('@mlld/claude-poll@1.2.0 installed (cached)'))).toBe(true);
    expect(logs.some(line => line.includes('import "@mlld/claude-poll" as @cp'))).toBe(true);
  });

  it('shows fresh install confirmation with import guidance for direct modules', async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      logs.push(value === undefined ? '' : String(value));
    });

    try {
      await (installCmd as any).report(
        [
          {
            module: '@mlld/claude-poll',
            status: 'installed',
            version: '1.2.0',
            isDirect: true
          }
        ],
        {},
        []
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.some(line => line.includes('@mlld/claude-poll@1.2.0 installed'))).toBe(true);
    expect(logs.some(line => line.includes('(cached)'))).toBe(false);
    expect(logs.some(line => line.includes('import "@mlld/claude-poll" as @cp'))).toBe(true);
  });
});

describe('installCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-install-root-'));
    vi.mocked(getCommandContext).mockResolvedValue({
      projectRoot: tempDir,
      lockFile: null,
      currentDir: tempDir,
      relativeToRoot: ''
    });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('creates a default config before install when none exists at the project root', async () => {
    const runInstall = vi.spyOn(InstallCommand.prototype, 'install').mockResolvedValue(undefined);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      logs.push(value === undefined ? '' : String(value));
    });

    try {
      await installCommand(['@alice/utils'], { basePath: tempDir });
    } finally {
      logSpy.mockRestore();
    }

    const configPath = path.join(tempDir, 'mlld-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

    expect(runInstall).toHaveBeenCalledWith(['@alice/utils'], { basePath: tempDir });
    expect(config.scriptDir).toBe('llm/run');
    expect(config.resolvers.prefixes[0].config.basePath).toBe('./llm/modules');
    expect(logs).toContain(`Created mlld-config.json at ${configPath}`);
  });

  it('does not rewrite an existing config before install', async () => {
    const configPath = path.join(tempDir, 'mlld-config.json');
    const existingConfig = JSON.stringify({ projectname: 'existing-project' }, null, 2);
    await fs.writeFile(configPath, existingConfig, 'utf8');

    const runInstall = vi.spyOn(InstallCommand.prototype, 'install').mockResolvedValue(undefined);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      logs.push(value === undefined ? '' : String(value));
    });

    try {
      await installCommand(['@alice/utils'], { basePath: tempDir });
    } finally {
      logSpy.mockRestore();
    }

    expect(runInstall).toHaveBeenCalledWith(['@alice/utils'], { basePath: tempDir });
    expect(await fs.readFile(configPath, 'utf8')).toBe(existingConfig);
    expect(logs.some(line => line.includes('Created mlld-config.json at'))).toBe(false);
  });
});
