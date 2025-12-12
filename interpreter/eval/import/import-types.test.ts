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

  it('supports cached URL imports with angle-bracket syntax', async () => {
    const fetchSpy = vi
      .spyOn(Environment.prototype, 'fetchURL')
      .mockResolvedValue('/var @value = "cached angle"');

    const source = `/import cached(5m) <https://example.com/angle.mld> as @remote\n/show @remote.value`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.importType).toBe('cached');
    expect(options?.cacheDurationMs).toBe(300_000);
    expect((output as string).trim()).toBe('cached angle');
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

  it('handles quoted resolver paths with liberal syntax', async () => {
    await fileSystem.writeFile(
      '/project/config.mld',
      '/var @apiKey = "secret-key"\n/export { @apiKey }'
    );

    const source = `/import { @apiKey } from "@base/config.mld"\n/show @apiKey`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(typeof output).toBe('string');
    expect((output as string).trim()).toBe('secret-key');
  });

  it('imports template collections with declared parameters', async () => {
    await fileSystem.writeFile(
      '/project/templates/agents/alice.att',
      'Agent: @message (@context)'
    );
    await fileSystem.writeFile(
      '/project/templates/bob.att',
      'Bob: @message'
    );

    const source = `/import templates from "./templates" as @tpl(message, context)
/show @tpl.agents.alice("hello", "world")`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect(typeof output).toBe('string');
    expect((output as string).trim()).toBe('Agent: hello (world)');
  });

  it('rejects template collection imports with undeclared variables', async () => {
    await fileSystem.writeFile(
      '/project/templates/bad.att',
      'Hi @message @oops'
    );

    const source = `/import templates from "./templates" as @tpl(message)
/show @tpl.bad("hello")`;

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/undeclared/i);
  });

  it('imports nested template directories with sanitized keys', async () => {
    await fileSystem.writeFile(
      '/project/templates/agents/alice.att',
      'Agent: @message'
    );
    await fileSystem.writeFile(
      '/project/templates/agents/finance/bob.att',
      'Finance: @message'
    );
    await fileSystem.writeFile(
      '/project/templates/finance/quarterly-report.att',
      'Report: @message'
    );

    const source = `/import templates from "./templates" as @tpl(message)
/show @tpl.agents.finance.bob("numbers")
/show @tpl.finance.quarterly_report("q1")
/show @tpl.agents.alice("hi")`;

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    const lines = (output as string).trim().split('\n').filter(l => l.length > 0);
    expect(lines[0]).toBe('Finance: numbers');
    expect(lines[1]).toBe('Report: q1');
    expect(lines[2]).toBe('Agent: hi');
  });

  it('supports dynamic template selection with bracket access', async () => {
    await fileSystem.writeFile(
      '/project/templates/agents/alice.att',
      'Agent: @message'
    );
    await fileSystem.writeFile(
      '/project/templates/agents/party.att',
      'Party: @message'
    );
    await fileSystem.writeFile(
      '/project/templates/agents/finance/bob.att',
      'Finance: @message'
    );

    const source = `/var @agent = "party"
/var @group = "finance"
/var @person = "bob"
/import templates from "./templates" as @tpl(message)
/show @tpl.agents[@agent]("welcome")
/show @tpl.agents[@group][@person]("regional update")
/show @tpl.agents.alice("hi")`;

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    const lines = (output as string).trim().split('\n').filter(l => l.length > 0);
    expect(lines[0]).toBe('Party: welcome');
    expect(lines[1]).toBe('Finance: regional update');
    expect(lines[2]).toBe('Agent: hi');
  });

  it('resolves bracket access with field expressions', async () => {
    await fileSystem.writeFile(
      '/project/templates/agents/alice.att',
      'Agent: @message'
    );
    await fileSystem.writeFile(
      '/project/templates/agents/party.att',
      'Party: @message'
    );

    const source = `/var @agentObj = { agent: "party" }
/import templates from "./templates" as @tpl(message)
/show @tpl.agents[@agentObj.agent]("dynamic field")`;

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('Party: dynamic field');
  });

  it('treats quoted non-resolver namespace as module reference', async () => {
    // This tests that "@author/module" in quotes gets treated as a module import
    // even though it goes through variable interpolation in the grammar
    const env = new Environment(fileSystem, pathService, PROJECT_ROOT);
    const evaluator = new ImportDirectiveEvaluator(env);
    const pathResolver = (evaluator as any).pathResolver;

    const directive = {
      values: {
        path: [
          { type: 'VariableReference', identifier: 'author', isSpecial: true },
          { type: 'Text', content: '/module' }
        ]
      }
    };

    const resolution = await pathResolver.resolveImportPath(directive);
    expect(resolution.type).toBe('module');
    expect(resolution.resolvedPath).toBe('@author/module');
  });
});
