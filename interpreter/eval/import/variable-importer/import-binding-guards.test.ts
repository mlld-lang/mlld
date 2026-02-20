import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { ImportBindingGuards } from './ImportBindingGuards';

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

describe('ImportBindingGuards', () => {
  it('keeps collision payload behavior stable', () => {
    const guards = new ImportBindingGuards();
    const env = createEnv();
    env.setImportBinding('value', {
      source: './existing.mld',
      location: { filePath: '/project/main.mld', line: 1, column: 1 }
    });

    let thrown: any;
    try {
      guards.ensureImportBindingAvailable(env, 'value', './incoming.mld', {
        filePath: '/project/main.mld',
        line: 2,
        column: 1
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'IMPORT_NAME_CONFLICT',
      details: {
        variableName: 'value'
      }
    });
    expect((thrown as Error).message).toContain('./existing.mld');
    expect((thrown as Error).message).toContain("Import collision - 'value'");
  });

  it('keeps binding write semantics stable by persisting only after variable assignment', () => {
    const guards = new ImportBindingGuards();
    const env = createEnv();
    const variable = createSimpleTextVariable('value', 'hello', SOURCE);

    guards.setVariableWithImportBinding(env, 'value', variable, {
      source: './module.mld',
      location: { filePath: '/project/main.mld', line: 1, column: 1 }
    });

    expect(env.getVariable('value')?.value).toBe('hello');
    expect(env.getImportBinding('value')?.source).toBe('./module.mld');
  });
});
