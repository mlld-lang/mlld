import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import type { ImportDirectiveNode } from '@core/types';
import { ImportDirectiveEvaluator } from './ImportDirectiveEvaluator';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { PathContext } from '@core/services/PathContextService';

const PROJECT_ROOT = '/project';
const MAIN_FILE = '/project/main.mld';

describe('Import type handling', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  let pathContext: PathContext;

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    pathContext = {
      projectRoot: PROJECT_ROOT,
      fileDirectory: PROJECT_ROOT,
      executionDirectory: PROJECT_ROOT,
      invocationDirectory: PROJECT_ROOT,
      filePath: MAIN_FILE
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('imports local files with explicit static type', async () => {
    await fileSystem.writeFile(
      '/project/import-types-static.mld',
      '/var @value = "static import"'
    );

    const source = `/import static <./import-types-static.mld> as @staticSource\n/show @staticSource.value`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(typeof output).toBe('string');
    expect((output as string).trim()).toBe('static import');
  });

  it('passes cached duration metadata to URL fetches', async () => {
    const fetchSpy = vi
      .spyOn(Environment.prototype, 'fetchURL')
      .mockResolvedValue('/var @value = "cached import"');

    const source = `/import cached(10s) "https://example.com/cached.mld" as @cached\n/show @cached.value`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.importType).toBe('cached');
    expect(options?.forImport).toBe(true);
    expect(options?.cacheDurationMs).toBe(10_000);
    expect((output as string).trim()).toBe('cached import');
  });

  it('infers cached type for URL imports without keyword', async () => {
    const fetchSpy = vi
      .spyOn(Environment.prototype, 'fetchURL')
      .mockResolvedValue('/var @value = "inferred cached"');

    const source = `/import "https://example.com/inferred.mld" as @inferred\n/show @inferred.value`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.importType).toBe('cached');
    expect(options?.cacheDurationMs).toBeUndefined();
    expect((output as string).trim()).toBe('inferred cached');
  });

  it('imports local files with inferred static type', async () => {
    await fileSystem.writeFile(
      '/project/import-types-file.mld',
      '/var @value = "inferred static"'
    );

    const source = `/import "./import-types-file.mld" as @helper\n/show @helper.value`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('inferred static');
  });

  it('supports explicit live imports from @input', async () => {
    const source = `/import live { value } from @input\n/show @value`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      stdinContent: '{"value":"live data"}',
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('live data');
  });


  it('infers local import type for @local resolver', async () => {
    const env = new Environment(fileSystem, pathService, PROJECT_ROOT);
    const evaluator: any = new ImportDirectiveEvaluator(env);
    const importDirective = { values: {} } as ImportDirectiveNode;
    const inferred = evaluator.resolveImportType(importDirective, {
      type: 'resolver',
      resolvedPath: '@local/tools',
      resolverName: 'local'
    });
    expect(inferred.importType).toBe('local');
  });

  it('infers static import type for @base resolver', async () => {
    const env = new Environment(fileSystem, pathService, PROJECT_ROOT);
    const evaluator: any = new ImportDirectiveEvaluator(env);
    const importDirective = { values: {} } as ImportDirectiveNode;
    const inferred = evaluator.resolveImportType(importDirective, {
      type: 'resolver',
      resolvedPath: '@base/templates',
      resolverName: 'base'
    });
    expect(inferred.importType).toBe('static');
  });
  it('throws when module type targets a filesystem path', async () => {
    await fileSystem.writeFile(
      '/project/import-types-module.mld',
      '/export { value }\n/var @value = "module"'
    );

    const source = `/import module { value } from "./import-types-module.mld"`;
    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/requires a registry module reference/);
  });
});
