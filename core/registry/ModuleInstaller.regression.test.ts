import { describe, expect, it, vi } from 'vitest';
import { ModuleInstaller, type ModuleSpecifier } from './ModuleInstaller';
import type { ModuleLockEntry } from './LockFile';

function createLockEntry(overrides: Partial<ModuleLockEntry> = {}): ModuleLockEntry {
  return {
    version: 'latest',
    resolved: 'hash-old',
    source: 'registry://@alice/pkg',
    integrity: 'sha256:hash-old',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    registryVersion: '1.0.0',
    ...overrides
  };
}

function createHarness(
  initialModules: Record<string, ModuleLockEntry>,
  resolveImpl?: (reference: string) => Promise<any>
): {
  installer: ModuleInstaller;
  modules: Record<string, ModuleLockEntry>;
  lockFile: {
    getModule: ReturnType<typeof vi.fn>;
    addModule: ReturnType<typeof vi.fn>;
    removeModule: ReturnType<typeof vi.fn>;
    calculateIntegrity: ReturnType<typeof vi.fn>;
    getModuleEntries: ReturnType<typeof vi.fn>;
  };
  moduleCache: {
    has: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  resolverManager: {
    resolve: ReturnType<typeof vi.fn>;
  };
} {
  const modules: Record<string, ModuleLockEntry> = { ...initialModules };

  const lockFile = {
    getModule: vi.fn((moduleName: string) => modules[moduleName]),
    addModule: vi.fn(async (moduleName: string, entry: ModuleLockEntry) => {
      modules[moduleName] = entry;
    }),
    removeModule: vi.fn(async (moduleName: string) => {
      delete modules[moduleName];
    }),
    calculateIntegrity: vi.fn(async (content: string) => `sha256:${content}`),
    getModuleEntries: vi.fn(() =>
      Object.entries(modules).map(([moduleName, entry]) => ({ moduleName, entry }))
    )
  };

  const moduleCache = {
    has: vi.fn(async () => false),
    remove: vi.fn(async () => {})
  };

  const resolverManager = {
    resolve: vi.fn(
      resolveImpl ??
        (async (_reference: string) => ({
          content: {
            content: 'module content',
            metadata: {
              version: '1.0.1',
              hash: 'hash-new',
              source: 'registry://@alice/pkg'
            }
          }
        }))
    )
  };

  const workspace: any = {
    projectRoot: '/tmp/project',
    lockFile,
    moduleCache,
    resolverManager,
    normalizeModuleName: (name: string) => name,
    buildReference: ({ name, version }: ModuleSpecifier) => (version ? `${name}@${version}` : name),
    getModulesFromLockFile: () =>
      lockFile.getModuleEntries().map(({ moduleName, entry }: any) => ({
        name: moduleName,
        version: entry.version
      }))
  };

  return {
    installer: new ModuleInstaller(workspace),
    modules,
    lockFile,
    moduleCache,
    resolverManager
  };
}

describe('ModuleInstaller regressions', () => {
  it('does not remove lock entries when a versioned install fails', async () => {
    const existing = createLockEntry({
      version: '1.2.0',
      registryVersion: '1.2.0',
      resolved: 'hash-1.2.0'
    });
    const harness = createHarness(
      { '@alice/pkg': existing },
      async () => {
        throw new Error('version not found');
      }
    );

    const result = await (harness.installer as any).installSingle(
      { name: '@alice/pkg', version: '9.9.9' },
      {}
    );

    expect(result.status).toBe('failed');
    expect(harness.lockFile.removeModule).not.toHaveBeenCalled();
    expect(harness.lockFile.addModule).not.toHaveBeenCalled();
    expect(harness.modules['@alice/pkg']).toEqual(existing);
  });

  it('skips pinned exact versions during update', async () => {
    const harness = createHarness({
      '@alice/pkg': createLockEntry({
        version: '1.2.0',
        registryVersion: '1.2.0',
        resolved: 'hash-1.2.0'
      })
    });

    const installSingleSpy = vi.spyOn(harness.installer as any, 'installSingle');
    const results = await harness.installer.updateModules([], {});

    expect(installSingleSpy).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        module: '@alice/pkg',
        previousVersion: '1.2.0',
        newVersion: '1.2.0',
        hash: 'hash-1.2.0',
        status: 'unchanged'
      }
    ]);
  });

  it('updates range-pinned modules using the pinned range', async () => {
    const harness = createHarness({
      '@alice/pkg': createLockEntry({
        version: '^1.2.0',
        registryVersion: '1.2.1',
        resolved: 'hash-1.2.1'
      })
    });

    const installSingleSpy = vi
      .spyOn(harness.installer as any, 'installSingle')
      .mockImplementation(async () => {
        harness.modules['@alice/pkg'] = createLockEntry({
          version: '^1.2.0',
          registryVersion: '1.2.5',
          resolved: 'hash-1.2.5'
        });
        return {
          module: '@alice/pkg',
          status: 'installed'
        };
      });

    const results = await harness.installer.updateModules([], {});

    expect(installSingleSpy).toHaveBeenCalledWith(
      { name: '@alice/pkg', version: '^1.2.0' },
      expect.objectContaining({ force: true })
    );
    expect(results[0]).toMatchObject({
      module: '@alice/pkg',
      previousVersion: '1.2.1',
      newVersion: '1.2.5',
      hash: 'hash-1.2.5',
      status: 'updated'
    });
  });

  it('preserves version constraints in lock entries after install', async () => {
    const harness = createHarness(
      {
        '@alice/pkg': createLockEntry({
          version: '^1.2.0',
          registryVersion: '1.2.1',
          resolved: 'hash-1.2.1'
        })
      },
      async reference => ({
        content: {
          content: 'updated module',
          metadata: {
            version: '1.2.5',
            hash: 'hash-1.2.5',
            source: `registry://${reference}`
          }
        }
      })
    );

    const result = await (harness.installer as any).installSingle(
      { name: '@alice/pkg', version: '^1.2.0' },
      {}
    );

    expect(result.status).toBe('installed');
    expect(harness.lockFile.addModule).toHaveBeenCalledTimes(1);
    const writtenEntry = harness.lockFile.addModule.mock.calls[0][1] as ModuleLockEntry;
    expect(writtenEntry.version).toBe('^1.2.0');
    expect(writtenEntry.registryVersion).toBe('1.2.5');
    expect(harness.modules['@alice/pkg'].version).toBe('^1.2.0');
    expect(harness.resolverManager.resolve).toHaveBeenCalledWith('@alice/pkg@^1.2.0', expect.any(Object));
  });
});
