import { describe, expect, it } from 'vitest';
import { ExportManifest } from '../ExportManifest';
import { createSimpleTextVariable, type Variable } from '@core/types/variable';
import { ModuleExportManifestValidator } from './ModuleExportManifestValidator';

const SOURCE = {
  directive: 'var' as const,
  syntax: 'literal' as const,
  hasInterpolation: false,
  isMultiLine: false
};

describe('ModuleExportManifestValidator', () => {
  it('keeps explicit export validation behavior stable for missing variable names', () => {
    const validator = new ModuleExportManifestValidator();
    const childVars = new Map<string, Variable>();
    childVars.set('value', createSimpleTextVariable('value', 'ok', SOURCE));
    const manifest = new ExportManifest();
    manifest.add([
      {
        name: 'missing',
        kind: 'variable',
        location: { filePath: '/project/module.mld', line: 3, column: 1 }
      }
    ]);

    let thrown: unknown;
    try {
      validator.resolveExportPlan(childVars, manifest);
    } catch (error) {
      thrown = error;
    }

    expect(thrown as object).toMatchObject({
      code: 'EXPORTED_NAME_NOT_FOUND',
      details: {
        filePath: '/project/module.mld',
        variableName: 'missing'
      }
    });
    expect((thrown as Error).message).toContain("Exported name 'missing' is not defined");
  });

  it('keeps explicit export and guard name extraction behavior stable', () => {
    const validator = new ModuleExportManifestValidator();
    const childVars = new Map<string, Variable>();
    childVars.set('value', createSimpleTextVariable('value', 'ok', SOURCE));
    const manifest = new ExportManifest();
    manifest.add([
      { name: 'value', kind: 'variable' },
      { name: 'moduleGuard', kind: 'guard' }
    ]);

    const plan = validator.resolveExportPlan(childVars, manifest);

    expect(plan.explicitExports).toEqual(new Set(['value']));
    expect(plan.guardNames).toEqual(['moduleGuard']);
  });
});
