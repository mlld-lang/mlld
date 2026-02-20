import { describe, expect, it } from 'vitest';
import type { ImportDirectiveNode } from '@core/types';
import type { ImportType } from '@core/types/security';
import type { ImportResolution } from './ImportPathResolver';
import {
  durationToMilliseconds,
  inferImportType,
  inferResolverImportType,
  resolveImportType,
  validateDeclaredImportType
} from './ImportTypePolicy';

function createDirective(
  values: Partial<ImportDirectiveNode['values']>
): ImportDirectiveNode {
  return { values } as ImportDirectiveNode;
}

function createResolution(overrides: Partial<ImportResolution>): ImportResolution {
  return {
    type: 'file',
    resolvedPath: './example.mld',
    ...overrides
  };
}

describe('ImportTypePolicy', () => {
  it('preserves declared import-type mismatch errors', () => {
    const directive = createDirective({ importType: 'module' });
    const resolution = createResolution({ type: 'file' });

    let thrown: unknown;
    try {
      resolveImportType(directive, resolution);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const importError = thrown as { code?: string; details?: Record<string, unknown>; message?: string };
    expect(importError.code).toBe('IMPORT_TYPE_MISMATCH');
    expect(importError.details?.importType).toBe('module');
    expect(importError.details?.resolvedType).toBe('file');
    expect(importError.message).toContain("Import type 'module' requires a registry module reference.");
  });

  it('preserves resolver compatibility rules for static and templates import types', () => {
    expect(() => validateDeclaredImportType('static', createResolution({ type: 'file' }))).not.toThrow();
    expect(() => validateDeclaredImportType('static', createResolution({ type: 'resolver', resolverName: 'base' }))).not.toThrow();
    expect(() => validateDeclaredImportType('static', createResolution({ type: 'resolver', resolverName: 'root' }))).not.toThrow();
    expect(() => validateDeclaredImportType('static', createResolution({ type: 'resolver', resolverName: 'project' }))).not.toThrow();
    expect(() => validateDeclaredImportType('static', createResolution({ type: 'resolver', resolverName: 'local' }))).toThrow(
      /supports local files or @base\/@root\/@project resolver paths/
    );

    expect(() => validateDeclaredImportType('templates', createResolution({ type: 'file' }))).not.toThrow();
    expect(() => validateDeclaredImportType('templates', createResolution({ type: 'resolver', resolverName: 'base' }))).not.toThrow();
    expect(() => validateDeclaredImportType('templates', createResolution({ type: 'resolver', resolverName: 'root' }))).not.toThrow();
    expect(() => validateDeclaredImportType('templates', createResolution({ type: 'resolver', resolverName: 'project' }))).not.toThrow();
    expect(() => validateDeclaredImportType('templates', createResolution({ type: 'resolver', resolverName: 'local' }))).not.toThrow();
  });

  it('preserves cache duration conversion semantics', () => {
    const units: Array<{ unit: ImportDirectiveNode['values']['cachedDuration']['unit']; expected: number }> = [
      { unit: 'seconds', expected: 1_000 },
      { unit: 'minutes', expected: 60_000 },
      { unit: 'hours', expected: 3_600_000 },
      { unit: 'days', expected: 86_400_000 },
      { unit: 'weeks', expected: 604_800_000 },
      { unit: 'years', expected: 31_536_000_000 }
    ];

    for (const { unit, expected } of units) {
      expect(durationToMilliseconds({ value: 1, unit })).toBe(expected);
    }

    expect(durationToMilliseconds()).toBeUndefined();
    expect(durationToMilliseconds({ value: 1, unit: 'fortnights' as any })).toBeUndefined();
  });

  it('applies cache duration only to cached imports', () => {
    const cachedContext = resolveImportType(
      createDirective({
        importType: 'cached',
        cachedDuration: { value: 5, unit: 'minutes' }
      }),
      createResolution({ type: 'url', resolvedPath: 'https://example.com/config.mld' })
    );
    expect(cachedContext.importType).toBe('cached');
    expect(cachedContext.cacheDurationMs).toBe(300_000);

    const liveContext = resolveImportType(
      createDirective({
        importType: 'live',
        cachedDuration: { value: 5, unit: 'minutes' }
      }),
      createResolution({ type: 'url', resolvedPath: 'https://example.com/config.mld' })
    );
    expect(liveContext.importType).toBe('live');
    expect(liveContext.cacheDurationMs).toBeUndefined();
  });

  it('keeps import-type inference behavior stable', () => {
    const cases: Array<{ resolution: ImportResolution; expected: ImportType }> = [
      { resolution: createResolution({ type: 'module' }), expected: 'module' },
      { resolution: createResolution({ type: 'node' }), expected: 'module' },
      { resolution: createResolution({ type: 'file' }), expected: 'static' },
      { resolution: createResolution({ type: 'url' }), expected: 'cached' },
      { resolution: createResolution({ type: 'input' }), expected: 'live' },
      { resolution: createResolution({ type: 'resolver', resolverName: 'local' }), expected: 'local' },
      { resolution: createResolution({ type: 'resolver', resolverName: 'base' }), expected: 'static' },
      { resolution: createResolution({ type: 'resolver', resolverName: 'cached' }), expected: 'live' }
    ];

    for (const { resolution, expected } of cases) {
      expect(inferImportType(resolution)).toBe(expected);
    }

    expect(inferResolverImportType(createResolution({ type: 'resolver', resolverName: 'project' }))).toBe('static');
    expect(inferResolverImportType(createResolution({ type: 'resolver', resolverName: 'templates' }))).toBe('live');
  });

  it('sets preferLocal for declared local imports targeting modules', () => {
    const resolution = createResolution({ type: 'module', resolvedPath: '@scope/toolkit' });
    const context = resolveImportType(
      createDirective({ importType: 'local' }),
      resolution
    );

    expect(context.importType).toBe('local');
    expect(resolution.preferLocal).toBe(true);
  });
});
