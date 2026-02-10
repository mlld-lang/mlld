import { describe, expect, it, vi } from 'vitest';
import { MlldImportError } from '@core/errors';
import { DirectoryImportHandler } from './DirectoryImportHandler';

type MockStat = {
  isDirectory: () => boolean;
  isFile: () => boolean;
};

function createMockStat(kind: 'dir' | 'file' | 'none'): MockStat {
  if (kind === 'dir') {
    return { isDirectory: () => true, isFile: () => false };
  }
  if (kind === 'file') {
    return { isDirectory: () => false, isFile: () => true };
  }
  return { isDirectory: () => false, isFile: () => false };
}

function createMockEnv({
  root,
  entries,
  directories,
  files
}: {
  root: string;
  entries: string[];
  directories: Set<string>;
  files: Set<string>;
}): any {
  const fsService = {
    isDirectory: vi.fn(async (target: string) => directories.has(target)),
    readdir: vi.fn(async (target: string) => (target === root ? entries : [])),
    stat: vi.fn(async (target: string) => {
      if (directories.has(target)) {
        return createMockStat('dir');
      }
      if (files.has(target)) {
        return createMockStat('file');
      }
      throw new Error(`Missing stat target: ${target}`);
    }),
    exists: vi.fn(async (target: string) => files.has(target))
  };

  const childEnv = {
    setCurrentFilePath: vi.fn()
  };

  return {
    fsService,
    env: {
      getFileSystemService: () => fsService,
      createChild: () => childEnv
    },
    childEnv
  };
}

describe('DirectoryImportHandler', () => {
  it('keeps traversal behavior with skipDirs + index discovery and deterministic ordering', async () => {
    const root = '/project/agents';
    const entries = ['_private', 'party', 'mllddev', '.hidden', 'noindex'];
    const directories = new Set<string>([
      root,
      '/project/agents/_private',
      '/project/agents/party',
      '/project/agents/mllddev',
      '/project/agents/.hidden',
      '/project/agents/noindex'
    ]);
    const files = new Set<string>([
      '/project/agents/_private/index.mld',
      '/project/agents/party/index.mld',
      '/project/agents/mllddev/index.mld',
      '/project/agents/.hidden/index.mld'
    ]);
    const { env } = createMockEnv({ root, entries, directories, files });

    const processModuleContent = vi.fn(async (resolution: any) => {
      const segments = resolution.resolvedPath.split('/');
      const directoryName = segments[segments.length - 2];
      return {
        moduleObject: { who: directoryName },
        frontmatter: null,
        childEnvironment: {},
        guardDefinitions: []
      };
    });
    const enforceModuleNeeds = vi.fn();
    const handler = new DirectoryImportHandler(processModuleContent as any, enforceModuleNeeds);

    const result = await handler.maybeProcessDirectoryImport(
      { type: 'file', resolvedPath: root, importType: 'live' } as any,
      { subtype: 'importNamespace', values: {}, meta: {} } as any,
      env as any
    );

    expect(result).not.toBeNull();
    expect(Object.keys(result!.moduleObject)).toEqual(['party', 'mllddev']);
    expect(processModuleContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ resolvedPath: '/project/agents/party/index.mld' }),
      expect.any(Object)
    );
    expect(processModuleContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ resolvedPath: '/project/agents/mllddev/index.mld' }),
      expect.any(Object)
    );
  });

  it('keeps mixed-name key sanitization collision behavior and error payloads', async () => {
    const root = '/project/agents';
    const entries = ['team one', 'team@one'];
    const directories = new Set<string>([
      root,
      '/project/agents/team one',
      '/project/agents/team@one'
    ]);
    const files = new Set<string>([
      '/project/agents/team one/index.mld',
      '/project/agents/team@one/index.mld'
    ]);
    const { env } = createMockEnv({ root, entries, directories, files });
    const handler = new DirectoryImportHandler(
      vi.fn(async () => ({
        moduleObject: { value: 'ok' },
        frontmatter: null,
        childEnvironment: {},
        guardDefinitions: []
      })) as any,
      vi.fn()
    );

    await expect(
      handler.maybeProcessDirectoryImport(
        { type: 'file', resolvedPath: root, importType: 'live' } as any,
        { subtype: 'importNamespace', values: { withClause: { skipDirs: [] } }, meta: {} } as any,
        env as any
      )
    ).rejects.toMatchObject({
      code: 'DIRECTORY_IMPORT_DUPLICATE_KEY',
      details: {
        path: root,
        key: 'team_one',
        entries: ['team@one']
      }
    });
  });

  it('keeps empty-directory failure semantics unchanged', async () => {
    const root = '/project/agents';
    const entries = ['party'];
    const directories = new Set<string>([root, '/project/agents/party']);
    const files = new Set<string>();
    const { env } = createMockEnv({ root, entries, directories, files });
    const handler = new DirectoryImportHandler(
      vi.fn(async () => ({
        moduleObject: { value: 'ok' },
        frontmatter: null,
        childEnvironment: {},
        guardDefinitions: []
      })) as any,
      vi.fn()
    );

    await expect(
      handler.maybeProcessDirectoryImport(
        { type: 'file', resolvedPath: root, importType: 'live' } as any,
        { subtype: 'importNamespace', values: {}, meta: {} } as any,
        env as any
      )
    ).rejects.toMatchObject({
      code: 'DIRECTORY_IMPORT_EMPTY',
      details: {
        path: root,
        index: 'index.mld'
      }
    });
  });

  it('keeps optional directory-skip behavior for templates imports', async () => {
    const root = '/project/templates';
    const entries = ['agents'];
    const directories = new Set<string>([root, '/project/templates/agents']);
    const files = new Set<string>(['/project/templates/agents/index.mld']);
    const { env, fsService } = createMockEnv({ root, entries, directories, files });
    const handler = new DirectoryImportHandler(
      vi.fn(async () => ({
        moduleObject: { value: 'ok' },
        frontmatter: null,
        childEnvironment: {},
        guardDefinitions: []
      })) as any,
      vi.fn()
    );

    const result = await handler.maybeProcessDirectoryImport(
      { type: 'file', resolvedPath: root, importType: 'templates' } as any,
      { subtype: 'importNamespace', values: {}, meta: {} } as any,
      env as any
    );

    expect(result).toBeNull();
    expect(fsService.readdir).not.toHaveBeenCalled();
  });
});
