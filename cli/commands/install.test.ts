import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InstallCommand } from './install';
import * as path from 'path';
import * as fs from 'fs/promises';
import { formatModuleReference } from '../utils/output';


describe('InstallCommand', () => {
  let tempDir: string;
  let installCommand: InstallCommand;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-install-'));
    installCommand = new InstallCommand(tempDir, { verbose: false });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should create install command instance', () => {
    expect(installCommand).toBeDefined();
  });

  it('should handle empty module list (install from lock)', async () => {
    // This test would verify the install from lock file functionality
    // For now, we'll just test that it doesn't crash
    await expect(installCommand.install([], { dryRun: true })).resolves.toBeUndefined();
  });

  it('should handle specific module installation', async () => {
    // Test installing specific modules
    const modules = ['@alice/utils', '@bob/helpers'];
    
    await expect(installCommand.install(modules, { dryRun: true })).resolves.toBeUndefined();
  });

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
      await (installCommand as any).report(
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
      await (installCommand as any).report(
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
