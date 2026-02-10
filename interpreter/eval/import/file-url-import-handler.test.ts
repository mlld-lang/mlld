import { describe, expect, it, vi } from 'vitest';
import { MlldImportError } from '@core/errors';
import { FileUrlImportHandler } from './FileUrlImportHandler';

describe('FileUrlImportHandler', () => {
  it('uses directory traversal result when directory import succeeds', async () => {
    const directoryResult = {
      moduleObject: { party: { who: 'party' } },
      frontmatter: null,
      childEnvironment: {},
      guardDefinitions: []
    };
    const processModuleContent = vi.fn();
    const variableImporter = {
      importVariables: vi.fn().mockResolvedValue(undefined)
    } as any;
    const directoryImportHandler = {
      maybeProcessDirectoryImport: vi.fn().mockResolvedValue(directoryResult)
    } as any;
    const validateModuleResult = vi.fn();
    const applyPolicyImportContext = vi.fn();
    const handler = new FileUrlImportHandler(
      processModuleContent,
      variableImporter,
      directoryImportHandler,
      validateModuleResult,
      applyPolicyImportContext
    );

    const env = {} as any;
    const directive = { subtype: 'importNamespace', values: {} } as any;
    const resolution = { type: 'file', resolvedPath: '/project/agents' } as any;

    await handler.evaluateFileImport(resolution, directive, env);

    expect(directoryImportHandler.maybeProcessDirectoryImport).toHaveBeenCalledWith(resolution, directive, env);
    expect(processModuleContent).not.toHaveBeenCalled();
    expect(validateModuleResult).toHaveBeenCalledWith(directoryResult, directive, '/project/agents');
    expect(variableImporter.importVariables).toHaveBeenCalledWith(directoryResult, directive, env);
    expect(applyPolicyImportContext).toHaveBeenCalledWith(directive, env, '/project/agents');
  });

  it('falls back to file/url module processing when directory traversal is not applicable', async () => {
    const fileResult = {
      moduleObject: { value: 'file-import' },
      frontmatter: null,
      childEnvironment: {},
      guardDefinitions: []
    };
    const processModuleContent = vi.fn().mockResolvedValue(fileResult);
    const variableImporter = {
      importVariables: vi.fn().mockResolvedValue(undefined)
    } as any;
    const directoryImportHandler = {
      maybeProcessDirectoryImport: vi.fn().mockResolvedValue(null)
    } as any;
    const validateModuleResult = vi.fn();
    const applyPolicyImportContext = vi.fn();
    const handler = new FileUrlImportHandler(
      processModuleContent,
      variableImporter,
      directoryImportHandler,
      validateModuleResult,
      applyPolicyImportContext
    );

    const env = {} as any;
    const directive = { subtype: 'importNamespace', values: {} } as any;
    const resolution = { type: 'file', resolvedPath: '/project/agents.mld' } as any;

    await handler.evaluateFileImport(resolution, directive, env);

    expect(directoryImportHandler.maybeProcessDirectoryImport).toHaveBeenCalledWith(resolution, directive, env);
    expect(processModuleContent).toHaveBeenCalledWith(resolution, directive);
    expect(validateModuleResult).toHaveBeenCalledWith(fileResult, directive, '/project/agents.mld');
    expect(variableImporter.importVariables).toHaveBeenCalledWith(fileResult, directive, env);
    expect(applyPolicyImportContext).toHaveBeenCalledWith(directive, env, '/project/agents.mld');
  });

  it('keeps collision precedence by failing before policy context application', async () => {
    const fileResult = {
      moduleObject: { production: { mode: 'strict' } },
      frontmatter: null,
      childEnvironment: {},
      guardDefinitions: []
    };
    const processModuleContent = vi.fn().mockResolvedValue(fileResult);
    const collisionError = new MlldImportError(
      "Import collision - 'production' already imported from ./policy-a.mld. Alias one of the imports.",
      {
        code: 'IMPORT_NAME_CONFLICT',
        details: { variableName: 'production' }
      }
    );
    const variableImporter = {
      importVariables: vi.fn().mockRejectedValue(collisionError)
    } as any;
    const directoryImportHandler = {
      maybeProcessDirectoryImport: vi.fn().mockResolvedValue(null)
    } as any;
    const validateModuleResult = vi.fn();
    const applyPolicyImportContext = vi.fn();
    const handler = new FileUrlImportHandler(
      processModuleContent,
      variableImporter,
      directoryImportHandler,
      validateModuleResult,
      applyPolicyImportContext
    );
    const directive = {
      subtype: 'importPolicy',
      values: {
        withClause: { policy: {} }
      }
    } as any;

    await expect(
      handler.evaluateFileImport(
        { type: 'file', resolvedPath: '/project/policies.mld' } as any,
        directive,
        {} as any
      )
    ).rejects.toBe(collisionError);
    expect(validateModuleResult).toHaveBeenCalledWith(fileResult, directive, '/project/policies.mld');
    expect(applyPolicyImportContext).not.toHaveBeenCalled();
  });
});
