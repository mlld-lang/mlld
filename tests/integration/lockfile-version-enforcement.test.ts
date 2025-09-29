import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImportDirectiveEvaluator } from '../../interpreter/eval/import/ImportDirectiveEvaluator';
import { Environment } from '../../interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { RegistryManager } from '@core/registry/RegistryManager';
import { LockFile } from '@core/registry/LockFile';

/**
 * Test lockfile version enforcement functionality
 * Tests that imports fail when lock file version doesn't match resolved version
 */
describe('LockFile Version Enforcement', () => {
  let tempDir: string;
  let lockPath: string;
  let mockEnv: any;
  let mockRegistryManager: any;
  let mockLockFile: any;
  let evaluator: ImportDirectiveEvaluator;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlld-lockfile-enforcement-test-'));
    lockPath = path.join(tempDir, 'mlld.lock.json');

    // Create mock lock file
    mockLockFile = {
      getImport: vi.fn()
    };

    // Create mock registry manager
    mockRegistryManager = {
      getLockFile: vi.fn().mockReturnValue(mockLockFile)
    };

    // Create mock environment
    mockEnv = {
      getRegistryManager: vi.fn().mockReturnValue(mockRegistryManager)
    };

    evaluator = new ImportDirectiveEvaluator(mockEnv as Environment);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // ignore cleanup errors in tests
    }
  });

  it('allows imports when lock file version matches resolved version', async () => {
    // Setup mock lock file to return matching version
    mockLockFile.getImport.mockReturnValue({
      resolved: 'https://example.com/module.mld',
      integrity: 'sha256:abc123',
      registryVersion: '1.2.0',
      approvedAt: new Date().toISOString()
    });

    // Mock resolver content with matching version
    const mockResolverContent = {
      content: '/var @test = "hello world"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/module@1.2.0',
        version: '1.2.0'
      }
    };

    // This should not throw an error since versions match
    await (evaluator as any)['validateLockFileVersion']('@user/module', mockResolverContent, mockEnv);

    // If we get here, the validation passed (which is what we want)
    expect(mockLockFile.getImport).toHaveBeenCalledWith('@user/module');
  });

  it('rejects imports when lock file version does not match resolved version', async () => {
    // Setup mock lock file to return different version
    mockLockFile.getImport.mockReturnValue({
      resolved: 'https://example.com/module.mld',
      integrity: 'sha256:abc123',
      registryVersion: '1.1.0', // Different from resolved version
      approvedAt: new Date().toISOString()
    });

    // Mock resolver content with different version
    const mockResolverContent = {
      content: '/var @test = "hello world"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/module@1.2.0', // Different from lock file
        version: '1.2.0'
      }
    };

    // This should throw an error due to version mismatch
    await expect(
      (evaluator as any)['validateLockFileVersion']('@user/module', mockResolverContent, mockEnv)
    ).rejects.toThrow(/Locked version mismatch for @user\/module/);
  });

  it('handles legacy lock entries without version gracefully', async () => {
    // Setup mock lock file without registryVersion (legacy format)
    mockLockFile.getImport.mockReturnValue({
      resolved: 'https://example.com/legacy-module.mld',
      integrity: 'sha256:def456',
      // No registryVersion field (legacy entry)
      approvedAt: new Date().toISOString()
    });

    // Mock resolver content
    const mockResolverContent = {
      content: '/var @legacy = "legacy module"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/legacy-module@2.0.0',
        version: '2.0.0'
      }
    };

    // This should not throw an error for legacy entries
    await (evaluator as any)['validateLockFileVersion']('@user/legacy-module', mockResolverContent, mockEnv);

    // If we get here, the validation passed (which is what we want for legacy entries)
    expect(mockLockFile.getImport).toHaveBeenCalledWith('@user/legacy-module');
  });

  it('ignores non-registry modules', async () => {
    // Mock non-registry resolver content (e.g., local file)
    const mockResolverContent = {
      content: '/var @local = "local module"',
      contentType: 'module' as const,
      metadata: {
        source: 'file:///local/module.mld', // Not a registry source
        // No version field
      }
    };

    // This should not throw an error since it's not a registry module
    await (evaluator as any)['validateLockFileVersion']('./local-module', mockResolverContent, mockEnv);

    // If we get here, the validation passed (which is what we want for non-registry modules)
    // Lock file should not be consulted for non-registry modules
    expect(mockLockFile.getImport).not.toHaveBeenCalled();
  });

  it('allows imports when no lock entry exists (new modules)', async () => {
    // Setup mock lock file to return undefined (no entry)
    mockLockFile.getImport.mockReturnValue(undefined);

    // Mock resolver content for a new module
    const mockResolverContent = {
      content: '/var @new = "new module"',
      contentType: 'module' as const,
      metadata: {
        source: 'registry://@user/new-module@1.0.0',
        version: '1.0.0'
      }
    };

    // This should not throw an error since no lock entry exists (new module)
    await (evaluator as any)['validateLockFileVersion']('@user/new-module', mockResolverContent, mockEnv);

    // If we get here, the validation passed (which is what we want for new modules)
    expect(mockLockFile.getImport).toHaveBeenCalledWith('@user/new-module');
  });
});