import { describe, expect, it } from 'vitest';
import { ExportManifest } from '../ExportManifest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { GuardExportChecker } from './GuardExportChecker';

function createEnv(): Environment {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  return env;
}

describe('GuardExportChecker', () => {
  it('keeps guard export context error behavior stable when child environment is missing', () => {
    const checker = new GuardExportChecker();

    let thrown: unknown;
    try {
      checker.validateGuardExports(['moduleGuard']);
    } catch (error) {
      thrown = error;
    }

    expect(thrown as object).toMatchObject({
      code: 'GUARD_EXPORT_CONTEXT',
      details: {
        guards: ['moduleGuard']
      }
    });
    expect((thrown as Error).message).toContain('Guard exports require a child environment');
  });

  it('keeps missing guard export error behavior stable', () => {
    const checker = new GuardExportChecker();
    const env = createEnv();
    const manifest = new ExportManifest();
    manifest.add([
      {
        name: 'moduleGuard',
        kind: 'guard',
        location: { filePath: '/project/module.mld', line: 7, column: 1 }
      }
    ]);

    let thrown: unknown;
    try {
      checker.validateGuardExports(['moduleGuard'], env, manifest);
    } catch (error) {
      thrown = error;
    }

    expect(thrown as object).toMatchObject({
      code: 'EXPORTED_GUARD_NOT_FOUND',
      details: {
        filePath: '/project/module.mld',
        variableName: 'moduleGuard'
      }
    });
    expect((thrown as Error).message).toContain("Exported guard 'moduleGuard' is not defined");
  });
});
