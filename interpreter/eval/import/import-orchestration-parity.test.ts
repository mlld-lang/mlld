import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpret } from '@interpreter/index';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import type { PathContext } from '@core/services/PathContextService';
import { ImportDirectiveEvaluator } from './ImportDirectiveEvaluator';

const PROJECT_ROOT = '/project';
const MAIN_FILE = '/project/main.mld';

function createPathContext(): PathContext {
  return {
    projectRoot: PROJECT_ROOT,
    fileDirectory: PROJECT_ROOT,
    executionDirectory: PROJECT_ROOT,
    invocationDirectory: PROJECT_ROOT,
    filePath: MAIN_FILE
  };
}

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), PROJECT_ROOT);
  env.setCurrentFilePath(MAIN_FILE);
  return env;
}

describe('Import orchestration parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps directory + module + policy import composition bindings stable', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();
    await fileSystem.writeFile('/project/policies.mld', '/var @mode = \"strict\"');
    await fileSystem.writeFile('/project/settings.mld', '/var @region = \"us-east\"');
    await fileSystem.writeFile('/project/agents/party/index.mld', '/var @who = \"party\"');

    const source = `/import policy @security from \"./policies.mld\"\n/import \"./agents\" as @agents\n/import { region } from \"./settings.mld\"\n/show @security.mode\n/show @agents.party.who\n/show @region`;
    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    const lines = (output as string)
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    expect(lines).toEqual(['strict', 'party', 'us-east']);
  });

  it('keeps needs-over-collision precedence when both failure paths are available', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();
    await fileSystem.writeFile(
      '/project/needs-collision.mld',
      '/needs { cmd: [__missing_cmd__] }\n/var @value = \"imported\"'
    );

    const source = `/var @value = \"existing\"\n/import { value } from \"./needs-collision.mld\"`;

    let thrown: unknown;
    try {
      await interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/requires capabilities not available/i);
    expect((thrown as Error).message).not.toMatch(/Import collision/i);
  });

  it('keeps policy-override parity across MCP and non-MCP branches', async () => {
    const env = createEnv();
    const evaluator: any = new ImportDirectiveEvaluator(env);

    const routeSpy = vi
      .spyOn(evaluator.importRequestRouter, 'routeImportRequest')
      .mockImplementation(async (_resolution: any, _directive: any, handlerEnv: Environment) => {
        expect(handlerEnv.getPolicyContext()).toEqual(
          expect.objectContaining({
            configs: expect.any(Object)
          })
        );
        return { value: undefined, env: handlerEnv };
      });
    const resolveImportPathSpy = vi.spyOn(evaluator.pathResolver, 'resolveImportPath');

    const sharedDirective = {
      subtype: 'importSelected',
      values: {
        path: [{ type: 'Text', content: './unused.mld' }],
        imports: [{ identifier: 'value' }],
        withClause: { policy: { io: { mode: 'strict' } } }
      },
      meta: {}
    } as any;
    const resolutions = [
      { type: 'resolver', resolvedPath: '@base/config.mld', resolverName: 'base' },
      { type: 'module', resolvedPath: '@scope/pkg' },
      { type: 'node', resolvedPath: 'node:path' },
      { type: 'file', resolvedPath: '/project/agents' },
      { type: 'url', resolvedPath: 'https://example.com/module.mld' }
    ];

    for (const resolution of resolutions) {
      resolveImportPathSpy.mockResolvedValueOnce(resolution);
      await evaluator.evaluateImport(sharedDirective, env);
    }

    expect(routeSpy).toHaveBeenCalledTimes(resolutions.length);
    expect(env.getPolicyContext()).toBeFalsy();

    vi.spyOn(env, 'getMcpImportManager').mockReturnValue({
      listTools: vi.fn().mockResolvedValue([
        { name: 'echo', inputSchema: { type: 'object', properties: {} } }
      ]),
      callTool: vi.fn()
    } as any);
    const setPolicyContextSpy = vi.spyOn(env, 'setPolicyContext');
    const mcpDirective = {
      subtype: 'importMcpSelected',
      values: {
        path: [{ type: 'Text', content: 'mock-server' }],
        imports: [{ identifier: 'echo', alias: 'echo' }],
        withClause: { policy: { io: { mode: 'strict' } } }
      },
      meta: {}
    } as any;

    await evaluator.evaluateImport(mcpDirective, env);
    expect(setPolicyContextSpy).toHaveBeenCalledTimes(2);
    expect(env.getPolicyContext()).toBeFalsy();
  });

  it('keeps imported guard helper resolution scoped to defining module', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();

    await fileSystem.writeFile(
      '/project/module.mld',
      [
        '/exe @helper(value) = `helper:@value`',
        '/guard @moduleGuard for secret = when [',
        '  * => allow @helper(@output)',
        ']',
        '/export { @moduleGuard }'
      ].join('\n')
    );

    const source = [
      '/import { @moduleGuard } from "./module.mld"',
      '/var secret @token = "sk-123"',
      '/show @token'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('helper:helper:sk-123');
  });

  it('keeps module imports idempotent when mixing guard and policy imports from same file', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();

    await fileSystem.writeFile(
      '/project/module.mld',
      [
        '/guard @moduleGuard for secret = when [',
        '  * => allow',
        ']',
        '/var @config = { allow: { cmd: ["echo"] } }',
        '/export { @moduleGuard, @config }'
      ].join('\n')
    );

    const source = [
      '/import { @moduleGuard } from "./module.mld"',
      '/import policy @policy from "./module.mld"',
      '/show @policy.config.allow.cmd[0]'
    ].join('\n');

    const output = await interpret(source, {
      fileSystem,
      pathService,
      pathContext,
      approveAllImports: true
    });

    expect((output as string).trim()).toBe('echo');
  });

  it('keeps alias-resolution conflict behavior stable for mixed namespace imports', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const pathContext = createPathContext();
    await fileSystem.writeFile('/project/module-a.mld', '/var @value = \"a\"');
    await fileSystem.writeFile('/project/module-b.mld', '/var @value = \"b\"');

    const source = `/import \"./module-a.mld\" as @shared\n/import \"./module-b.mld\" as @shared`;

    await expect(
      interpret(source, {
        fileSystem,
        pathService,
        pathContext,
        approveAllImports: true
      })
    ).rejects.toThrow(/Import collision - 'shared' already imported from/i);
  });
});
