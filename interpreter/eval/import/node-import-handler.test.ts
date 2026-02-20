import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { MlldImportError } from '@core/errors';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { VariableImporter } from './VariableImporter';
import { NodeImportHandler } from './NodeImportHandler';
import { normalizeNodeModuleExports, resolveNodeModule, wrapNodeExport } from '../../utils/node-interop';

vi.mock('../../utils/node-interop', () => ({
  resolveNodeModule: vi.fn(),
  normalizeNodeModuleExports: vi.fn((module: any) => module),
  wrapNodeExport: vi.fn((value: unknown) => value)
}));

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

describe('NodeImportHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports normalized node exports and applies policy context via callbacks', async () => {
    const env = createEnv();
    const variableImporter = new VariableImporter(new ObjectReferenceResolver());
    const validateModuleResult = vi.fn();
    const applyPolicyImportContext = vi.fn();
    const handler = new NodeImportHandler(variableImporter, validateModuleResult, applyPolicyImportContext);

    vi.mocked(resolveNodeModule).mockResolvedValue({
      module: {
        foo: 'bar',
        greet: () => 'hi'
      },
      spec: 'mock-pkg'
    } as any);

    const directive = {
      subtype: 'importSelected',
      values: {
        imports: [{ identifier: 'foo' }]
      }
    } as any;

    await handler.evaluateNodeImport({ type: 'node', resolvedPath: 'mock-pkg' } as any, directive, env);

    expect(vi.mocked(normalizeNodeModuleExports)).toHaveBeenCalledWith({
      foo: 'bar',
      greet: expect.any(Function)
    });
    expect(vi.mocked(wrapNodeExport)).toHaveBeenCalledWith('bar', {
      name: 'foo',
      moduleName: 'mock-pkg'
    });
    expect(validateModuleResult).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleObject: expect.objectContaining({ foo: 'bar' })
      }),
      directive,
      'node:mock-pkg'
    );
    expect(env.getVariable('foo')?.value).toBe('bar');
    expect(applyPolicyImportContext).toHaveBeenCalledWith(directive, env, 'node:mock-pkg');
  });

  it('preserves no-exports validation failure behavior from processing-result checks', async () => {
    const env = createEnv();
    const variableImporter = new VariableImporter(new ObjectReferenceResolver());
    const validationError = new MlldImportError("Import 'missing' not found in module 'node:mock-pkg'", {
      code: 'IMPORT_EXPORT_MISSING'
    });
    const validateModuleResult = vi.fn(() => {
      throw validationError;
    });
    const applyPolicyImportContext = vi.fn();
    const handler = new NodeImportHandler(variableImporter, validateModuleResult, applyPolicyImportContext);

    vi.mocked(resolveNodeModule).mockResolvedValue({
      module: {
        foo: 'bar'
      },
      spec: 'mock-pkg'
    } as any);

    const directive = {
      subtype: 'importSelected',
      values: {
        imports: [{ identifier: 'missing' }]
      }
    } as any;

    await expect(
      handler.evaluateNodeImport({ type: 'node', resolvedPath: 'mock-pkg' } as any, directive, env)
    ).rejects.toBe(validationError);
    expect(applyPolicyImportContext).not.toHaveBeenCalled();
  });
});
