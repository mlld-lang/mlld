import { describe, it, expect, vi, afterEach } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { MlldImportError } from '@core/errors';
import { ImportDirectiveEvaluator } from './ImportDirectiveEvaluator';

const SOURCE = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

describe('ImportDirectiveEvaluator characterization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps MCP selected-import alias collision behavior stable', async () => {
    const env = createEnv();
    const evaluator = new ImportDirectiveEvaluator(env);
    vi.spyOn(env, 'getMcpImportManager').mockReturnValue({
      listTools: vi.fn().mockResolvedValue([
        { name: 'echo', inputSchema: { type: 'object', properties: {} } },
        { name: 'ping', inputSchema: { type: 'object', properties: {} } }
      ]),
      callTool: vi.fn()
    } as any);

    const directive = {
      subtype: 'importMcpSelected',
      values: {
        path: [{ type: 'Text', content: 'mock-server' }],
        imports: [
          { identifier: 'echo', alias: 'dup' },
          { identifier: 'ping', alias: 'dup' }
        ]
      },
      meta: {}
    } as any;

    await expect(evaluator.evaluateImport(directive, env)).rejects.toMatchObject({
      code: 'IMPORT_NAME_CONFLICT'
    });
  });

  it('keeps declared import-type mismatch validation behavior stable', () => {
    const env = createEnv();
    const evaluator: any = new ImportDirectiveEvaluator(env);

    expect(() =>
      evaluator.validateDeclaredImportType('cached', {
        type: 'file',
        resolvedPath: '/project/local.mld'
      })
    ).toThrow(/Import type 'cached' requires an absolute URL source/);

    expect(() =>
      evaluator.validateDeclaredImportType('module', {
        type: 'file',
        resolvedPath: '/project/local.mld'
      })
    ).toThrow(/Import type 'module' requires a registry module reference/);
  });

  it('keeps directory skipDirs option validation behavior stable', () => {
    const env = createEnv();
    const evaluator: any = new ImportDirectiveEvaluator(env);
    const directive = {
      meta: {
        withClause: {
          skipDirs: 'not-an-array'
        }
      },
      values: {}
    };

    expect(() => evaluator.getDirectoryImportSkipDirs(directive as any, '/project/agents')).toThrow(
      /expects an array/
    );
  });

  it('keeps module candidate fallback behavior stable', async () => {
    const env = createEnv();
    const evaluator: any = new ImportDirectiveEvaluator(env);

    const resolveModuleSpy = vi.spyOn(env, 'resolveModule').mockImplementation(async (candidate: string) => {
      if (candidate.endsWith('.txt')) {
        return {
          content: 'not-a-module',
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
    const validateLockSpy = vi
      .spyOn(evaluator, 'validateLockFileVersion')
      .mockResolvedValue(undefined);
    const importFromResolverSpy = vi
      .spyOn(evaluator, 'importFromResolverContent')
      .mockResolvedValue({ value: undefined, env });

    const resolution = {
      type: 'module',
      resolvedPath: '@scope/pkg',
      moduleExtension: '.txt',
      importType: 'module'
    };

    await evaluator.evaluateModuleImport(resolution as any, { values: {}, subtype: 'importSelected' } as any, env);

    expect(resolveModuleSpy).toHaveBeenNthCalledWith(1, '@scope/pkg.txt', 'import');
    expect(resolveModuleSpy).toHaveBeenNthCalledWith(2, '@scope/pkg', 'import');
    expect(validateLockSpy).toHaveBeenCalledWith('@scope/pkg', expect.any(Object), env);
    expect(importFromResolverSpy).toHaveBeenCalledWith(
      expect.any(Object),
      '@scope/pkg',
      expect.any(Object),
      env
    );
  });

  it('keeps needs/policy enforcement failure behavior stable', () => {
    const env = createEnv();
    const evaluator: any = new ImportDirectiveEvaluator(env);
    vi.spyOn(evaluator, 'findUnmetNeeds').mockReturnValue([
      { capability: 'cmd', value: '__missing__', reason: 'command not found in PATH' }
    ]);

    let thrown: unknown;
    try {
      evaluator.enforceModuleNeeds({ cmd: { type: 'list', commands: ['__missing__'] } }, '/project/needs.mld');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MlldImportError);
    expect((thrown as any).code).toBe('NEEDS_UNMET');
    expect((thrown as Error).message).toContain('Import needs not satisfied for /project/needs.mld');
    expect((thrown as Error).message).toContain("cmd '__missing__'");
  });

  it('keeps MCP import binding collision behavior stable for existing variables', () => {
    const env = createEnv();
    const evaluator: any = new ImportDirectiveEvaluator(env);
    env.setVariable('tool', createSimpleTextVariable('tool', 'existing', SOURCE));

    expect(() =>
      evaluator.ensureMcpImportBindingAvailable(env, 'tool', 'mcp://server')
    ).toThrow(/Import collision - 'tool' already defined/);
  });
});
