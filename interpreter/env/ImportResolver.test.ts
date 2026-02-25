import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { ImportResolver, type ImportResolverDependencies } from './ImportResolver';

function createDependencies(projectRoot: string): ImportResolverDependencies {
  const fileSystem = {
    exists: vi.fn(async () => false),
    readFile: vi.fn(async () => '')
  } as any;

  return {
    fileSystem,
    pathService: {} as any,
    pathContext: {
      projectRoot,
      fileDirectory: projectRoot
    } as any,
    cacheManager: {} as any,
    getSecurityManager: () => undefined,
    getRegistryManager: () => undefined,
    getResolverManager: () => undefined,
    getParent: () => undefined,
    getCurrentFilePath: () => undefined,
    getApproveAllImports: () => false,
    getLocalFileFuzzyMatch: () => false,
    getURLConfig: () => undefined,
    getDefaultUrlOptions: () => ({
      allowedProtocols: ['https'],
      allowedDomains: [],
      blockedDomains: [],
      maxResponseSize: 1024 * 1024,
      timeout: 1000
    }),
    getAllowAbsolutePaths: () => true
  };
}

describe('ImportResolver', () => {
  it('includes resolved @root path details in not-found errors', async () => {
    const projectRoot = path.resolve('/tmp/mlld-project');
    const resolver = new ImportResolver(createDependencies(projectRoot));

    await expect(resolver.resolvePath('@root/data/config.json')).rejects.toThrow(
      `File not found: @root/data/config.json (resolved to ${path.join(projectRoot, 'data/config.json')})`
    );
  });
});
