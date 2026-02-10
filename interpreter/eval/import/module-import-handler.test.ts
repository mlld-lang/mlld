import { describe, it, expect, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ModuleImportHandler } from './ModuleImportHandler';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

describe('ModuleImportHandler', () => {
  it('keeps candidate fallback order with explicit module extension', async () => {
    const env = createEnv();
    const handler = new ModuleImportHandler();
    const importFromResolverContent = vi.fn().mockResolvedValue({ value: undefined, env });

    const resolveModuleSpy = vi.spyOn(env, 'resolveModule').mockImplementation(async (candidate: string) => {
      if (candidate.endsWith('.txt')) {
        return {
          content: 'plain-text',
          contentType: 'text',
          metadata: {},
          mx: {}
        } as any;
      }
      return {
        content: '/var @value = "ok"',
        contentType: 'module',
        metadata: {
          source: 'registry://@scope/pkg@1.0.0',
          version: '1.0.0'
        },
        mx: {}
      } as any;
    });

    const resolution = {
      type: 'module',
      resolvedPath: '@scope/pkg',
      moduleExtension: '.txt',
      importType: 'module'
    } as any;
    const directive = { subtype: 'importSelected', values: {} } as any;

    await handler.evaluateModuleImport(resolution, directive, env, importFromResolverContent);

    expect(resolveModuleSpy).toHaveBeenNthCalledWith(1, '@scope/pkg.txt', 'import');
    expect(resolveModuleSpy).toHaveBeenNthCalledWith(2, '@scope/pkg', 'import');
    expect(importFromResolverContent).toHaveBeenCalledWith(
      directive,
      '@scope/pkg',
      expect.objectContaining({ contentType: 'module' }),
      env
    );
  });

  it('keeps local-module preference behavior for preferLocal imports', async () => {
    const env = createEnv();
    const handler = new ModuleImportHandler();
    vi.spyOn(env, 'getResolverManager').mockReturnValue({
      hasLocalModule: vi.fn().mockReturnValue(false)
    } as any);

    await expect(
      handler.evaluateModuleImport(
        {
          type: 'module',
          resolvedPath: '@scope/pkg',
          preferLocal: true
        } as any,
        { subtype: 'importSelected', values: {} } as any,
        env,
        vi.fn()
      )
    ).rejects.toMatchObject({ code: 'LOCAL_MODULE_NOT_FOUND' });
  });

  it('keeps no-exports failure semantics and stops fallback traversal', async () => {
    const env = createEnv();
    const handler = new ModuleImportHandler();
    const noExportsError = Object.assign(new Error('no exports'), { code: 'IMPORT_NO_EXPORTS' });
    const resolveModuleSpy = vi
      .spyOn(env, 'resolveModule')
      .mockRejectedValueOnce(noExportsError)
      .mockResolvedValueOnce({
        content: '/var @value = "ok"',
        contentType: 'module',
        metadata: {},
        mx: {}
      } as any);
    const importFromResolverContent = vi.fn();

    await expect(
      handler.evaluateModuleImport(
        {
          type: 'module',
          resolvedPath: '@scope/pkg',
          moduleExtension: '.mld',
          importType: 'module'
        } as any,
        { subtype: 'importSelected', values: {} } as any,
        env,
        importFromResolverContent
      )
    ).rejects.toMatchObject({ code: 'IMPORT_NO_EXPORTS' });

    expect(resolveModuleSpy).toHaveBeenCalledTimes(1);
    expect(importFromResolverContent).not.toHaveBeenCalled();
  });

  it('keeps lock-file mismatch validation behavior for registry modules', async () => {
    const env = createEnv();
    const handler = new ModuleImportHandler();
    vi.spyOn(env, 'resolveModule').mockResolvedValue({
      content: '/var @value = "ok"',
      contentType: 'module',
      metadata: {
        source: 'registry://@scope/pkg@2.0.0',
        version: '2.0.0'
      },
      mx: {}
    } as any);
    vi.spyOn(env, 'getRegistryManager').mockReturnValue({
      getLockFile: () => ({
        getImport: (moduleRef: string) => (moduleRef === '@scope/pkg' ? { registryVersion: '1.0.0' } : null)
      })
    } as any);

    await expect(
      handler.evaluateModuleImport(
        {
          type: 'module',
          resolvedPath: '@scope/pkg',
          importType: 'module'
        } as any,
        { subtype: 'importSelected', values: {} } as any,
        env,
        vi.fn()
      )
    ).rejects.toThrow(/Locked version mismatch for @scope\/pkg/);
  });
});
