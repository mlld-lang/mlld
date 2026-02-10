import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModuleImportHandler } from '../../interpreter/eval/import/ModuleImportHandler';

describe('LockFile Version Enforcement', () => {
  let mockEnv: any;
  let mockRegistryManager: any;
  let mockLockFile: any;
  let moduleImportHandler: ModuleImportHandler;

  beforeEach(() => {
    mockLockFile = {
      getImport: vi.fn()
    };

    mockRegistryManager = {
      getLockFile: vi.fn().mockReturnValue(mockLockFile)
    };

    mockEnv = {
      getRegistryManager: vi.fn().mockReturnValue(mockRegistryManager)
    };

    moduleImportHandler = new ModuleImportHandler();
  });

  it('allows imports when lock file version matches resolved version', async () => {
    mockLockFile.getImport.mockReturnValue({
      resolved: 'https://example.com/module.mld',
      integrity: 'sha256:abc123',
      registryVersion: '1.2.0',
      approvedAt: new Date().toISOString()
    });

    const mockResolverContent = {
      content: '/var @test = "hello world"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/module@1.2.0',
        version: '1.2.0'
      }
    };

    await (moduleImportHandler as any).validateLockFileVersion(mockResolverContent, mockEnv);
    expect(mockLockFile.getImport).toHaveBeenCalledWith('@user/module');
  });

  it('rejects imports when lock file version does not match resolved version', async () => {
    mockLockFile.getImport.mockReturnValue({
      resolved: 'https://example.com/module.mld',
      integrity: 'sha256:abc123',
      registryVersion: '1.1.0',
      approvedAt: new Date().toISOString()
    });

    const mockResolverContent = {
      content: '/var @test = "hello world"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/module@1.2.0',
        version: '1.2.0'
      }
    };

    await expect(
      (moduleImportHandler as any).validateLockFileVersion(mockResolverContent, mockEnv)
    ).rejects.toThrow(/Locked version mismatch for @user\/module/);
  });

  it('handles legacy lock entries without version gracefully', async () => {
    mockLockFile.getImport.mockReturnValue({
      resolved: 'https://example.com/legacy-module.mld',
      integrity: 'sha256:def456',
      approvedAt: new Date().toISOString()
    });

    const mockResolverContent = {
      content: '/var @legacy = "legacy module"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/legacy-module@2.0.0',
        version: '2.0.0'
      }
    };

    await (moduleImportHandler as any).validateLockFileVersion(mockResolverContent, mockEnv);
    expect(mockLockFile.getImport).toHaveBeenCalledWith('@user/legacy-module');
  });

  it('ignores non-registry modules', async () => {
    const mockResolverContent = {
      content: '/var @local = "local module"',
      contentType: 'module' as const,
      metadata: {
        source: 'file:///local/module.mld'
      }
    };

    await (moduleImportHandler as any).validateLockFileVersion(mockResolverContent, mockEnv);
    expect(mockLockFile.getImport).not.toHaveBeenCalled();
  });

  it('allows imports when no lock entry exists (new modules)', async () => {
    mockLockFile.getImport.mockReturnValue(undefined);

    const mockResolverContent = {
      content: '/var @new = "new module"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/new-module@1.0.0',
        version: '1.0.0'
      }
    };

    await (moduleImportHandler as any).validateLockFileVersion(mockResolverContent, mockEnv);
    expect(mockLockFile.getImport).toHaveBeenCalledWith('@user/new-module');
  });
});
