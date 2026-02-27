import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { RegistryManager } from './RegistryManager';

describe('RegistryManager', () => {
  let projectRoot: string;
  let manager: RegistryManager;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mlld-registry-manager-'));
    manager = new RegistryManager(projectRoot, {
      telemetry: { enabled: false }
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('fetches locked content, verifies integrity, and caches result', async () => {
    const importPath = 'mlld://alice/tool';
    const resolved = 'https://example.com/tool.mld';
    const content = '/var @module = "ok"';
    const integrity = await manager.getLockFile().calculateIntegrity(content);

    await manager.getLockFile().addImport(importPath, {
      version: 'latest',
      resolved,
      source: resolved,
      integrity,
      fetchedAt: new Date().toISOString()
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => content
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const firstResolution = await manager.resolveImport(importPath);
    expect(firstResolution).toBe(resolved);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(resolved);

    const cached = await manager.getCache().get(resolved);
    expect(cached).toBe(content);

    const secondResolution = await manager.resolveImport(importPath);
    expect(secondResolution).toBe(content);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects locked fetch when integrity does not match', async () => {
    const importPath = 'mlld://alice/tool';
    const resolved = 'https://example.com/tool.mld';
    const expectedContent = '/var @module = "expected"';
    const actualContent = '/var @module = "tampered"';
    const integrity = await manager.getLockFile().calculateIntegrity(expectedContent);

    await manager.getLockFile().addImport(importPath, {
      version: 'latest',
      resolved,
      source: resolved,
      integrity,
      fetchedAt: new Date().toISOString()
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => actualContent
      }) as any
    );

    await expect(manager.resolveImport(importPath)).rejects.toThrow(/Lock integrity check failed/);
    expect(await manager.getCache().get(resolved)).toBeNull();
  });

  it('resolves registry lock sources to gist raw URLs before integrity verification', async () => {
    const importPath = 'mlld://alice/tool';
    const resolved = 'registry://@alice/tool';
    const content = '/var @module = "from-registry"';
    const integrity = await manager.getLockFile().calculateIntegrity(content);

    await manager.getLockFile().addImport(importPath, {
      version: 'latest',
      resolved,
      source: resolved,
      integrity,
      fetchedAt: new Date().toISOString()
    });

    const resolverSpy = vi
      .spyOn(manager.getResolver(), 'resolve')
      .mockResolvedValue('mlld://gist/alice/abc123');

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => content
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const result = await manager.resolveImport(importPath);
    expect(result).toBe(resolved);
    expect(resolverSpy).toHaveBeenCalledWith('mlld://alice/tool');
    expect(fetchSpy).toHaveBeenCalledWith('https://gist.githubusercontent.com/alice/abc123/raw/');
    expect(await manager.getCache().get(resolved)).toBe(content);
  });
});
