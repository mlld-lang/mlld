import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ResolverManager } from '@core/resolvers/ResolverManager';
import { LocalResolver } from '@core/resolvers/LocalResolver';
import { ProjectPathResolver } from '@core/resolvers/ProjectPathResolver';
import { HTTPResolver } from '@core/resolvers/HTTPResolver';
import { RegistryResolver } from '@core/resolvers/RegistryResolver';

describe('Path Directive Removal', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  let resolverManager: ResolverManager;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();

    resolverManager = new ResolverManager();
    resolverManager.registerResolver(new LocalResolver(fileSystem));
    resolverManager.registerResolver(new ProjectPathResolver(fileSystem));
    resolverManager.registerResolver(new HTTPResolver());
    resolverManager.registerResolver(new RegistryResolver());

    resolverManager.configurePrefixes([
      {
        prefix: '/',
        resolver: 'LOCAL',
        config: { basePath: '/' }
      },
      {
        prefix: './',
        resolver: 'LOCAL',
        config: { basePath: '/' }
      },
      {
        prefix: '@base',
        resolver: 'base',
        config: { basePath: '/' }
      },
      {
        prefix: 'https:',
        resolver: 'HTTP',
        config: { baseUrl: 'https://example.com', headers: {} }
      }
    ]);
  });

  afterEach(() => {
    delete (globalThis as any).__mlldFetchOverride;
  });

  it('rejects legacy /path syntax', async () => {
    await expect(
      interpret('/path @readme = "./readme.txt"\n/show @readme', {
        fileSystem,
        pathService,
        basePath: '/',
        resolverManager
      })
    ).rejects.toThrow();
  });

  it('loads local files with /var + alligator syntax', async () => {
    await fileSystem.writeFile('/readme.txt', 'This is a readme file');

    const result = await interpret('/var @readme = <./readme.txt>\n/show @readme', {
      fileSystem,
      pathService,
      basePath: '/',
      resolverManager
    });

    expect(result.trim()).toBe('This is a readme file');
  });

  it('loads @base file references with /var + alligator syntax', async () => {
    await fileSystem.mkdir('/project');
    await fileSystem.writeFile('/project/src/data.txt', 'Project data');

    const result = await interpret('/var @data = <@base/src/data.txt>\n/show @data', {
      fileSystem,
      pathService,
      basePath: '/project',
      resolverManager
    });

    expect(result.trim()).toBe('Project data');
  });

});
