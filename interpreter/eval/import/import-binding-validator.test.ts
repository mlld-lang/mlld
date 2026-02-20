import { describe, expect, it } from 'vitest';
import { ImportBindingValidator } from './ImportBindingValidator';

describe('ImportBindingValidator', () => {
  it('keeps missing-export validation payload behavior stable', () => {
    const validator = new ImportBindingValidator();
    const directive = {
      subtype: 'importSelected',
      values: {
        imports: [{ identifier: 'missing' }]
      }
    } as any;

    let thrown: any;
    try {
      validator.validateExportBindings(
        { present: 'ok' },
        directive,
        '/project/module.mld'
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'IMPORT_EXPORT_MISSING',
      details: {
        source: '/project/module.mld',
        missing: 'missing'
      }
    });
  });

  it('keeps guard export resolution behavior stable for selected imports', () => {
    const validator = new ImportBindingValidator();
    const directive = {
      subtype: 'importSelected',
      values: {
        imports: [{ identifier: 'isAllowed' }]
      }
    } as any;

    expect(() =>
      validator.validateExportBindings(
        {},
        directive,
        '/project/module.mld',
        [{ name: 'isAllowed' } as any]
      )
    ).not.toThrow();
  });
});
