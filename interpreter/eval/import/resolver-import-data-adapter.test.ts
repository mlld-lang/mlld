import { describe, expect, it, vi } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ObjectReferenceResolver } from './ObjectReferenceResolver';
import { VariableImporter } from './VariableImporter';
import { ResolverImportDataAdapter } from './ResolverImportDataAdapter';

function createAdapter(): { adapter: ResolverImportDataAdapter; env: Environment } {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/project');
  env.setCurrentFilePath('/project/main.mld');
  const variableImporter = new VariableImporter(new ObjectReferenceResolver());
  return {
    adapter: new ResolverImportDataAdapter(variableImporter),
    env
  };
}

describe('ResolverImportDataAdapter', () => {
  it('parses fallback resolver JSON data and preserves requested-import resolution', async () => {
    const { adapter } = createAdapter();
    const resolver = {
      resolve: vi.fn().mockResolvedValue({
        contentType: 'data',
        content: '{"now":"2026-02-10T00:00:00Z"}'
      })
    };
    const directive = {
      subtype: 'importSelected',
      values: { imports: [{ identifier: 'now' }] }
    } as any;

    const exportData = await adapter.fallbackResolverData(resolver, directive, 'TIME');

    expect(exportData).toEqual({ now: '2026-02-10T00:00:00Z' });
    expect(resolver.resolve).toHaveBeenCalledWith('@TIME', {
      context: 'import',
      requestedImports: ['now']
    });
  });

  it('keeps fallback resolver parsing behavior for invalid JSON and object data', async () => {
    const { adapter } = createAdapter();
    const directive = { subtype: 'importNamespace', values: {} } as any;

    const invalidJson = await adapter.fallbackResolverData(
      { resolve: vi.fn().mockResolvedValue({ contentType: 'data', content: 'not-json' }) },
      directive,
      'TIME'
    );
    expect(invalidJson).toEqual({ value: 'not-json' });

    const objectData = await adapter.fallbackResolverData(
      { resolve: vi.fn().mockResolvedValue({ contentType: 'data', content: { value: 'direct' } }) },
      directive,
      'TIME'
    );
    expect(objectData).toEqual({ value: 'direct' });
  });

  it('keeps selected format import resolution behavior for resolver getExportData adapters', async () => {
    const { adapter } = createAdapter();
    const resolver = {
      getExportData: vi.fn(async (format?: string) => {
        if (format) {
          return { [format]: '2026-02-10' };
        }
        return { iso: '2026-02-10', unix: 1_739_145_600 };
      })
    };

    const formatDirective = {
      subtype: 'importSelected',
      values: { imports: [{ identifier: '"iso"', alias: 'date' }] }
    } as any;
    const formatData = await adapter.getResolverExportData(resolver, formatDirective, 'TIME');
    expect(formatData).toEqual({ date: '2026-02-10' });
    expect(resolver.getExportData).toHaveBeenCalledWith('iso');

    const selectedDirective = {
      subtype: 'importSelected',
      values: { imports: [{ identifier: 'iso' }] }
    } as any;
    const selectedData = await adapter.getResolverExportData(resolver, selectedDirective, 'TIME');
    expect(selectedData).toEqual({ iso: '2026-02-10', unix: 1_739_145_600 });
    expect(resolver.getExportData).toHaveBeenCalledWith();
  });

  it('imports selected resolver variables and preserves missing-export errors', async () => {
    const { adapter, env } = createAdapter();
    const directive = {
      subtype: 'importSelected',
      values: { imports: [{ identifier: 'foo', alias: 'bar' }] }
    } as any;

    await adapter.importResolverVariables(directive, { foo: 'value' }, env, '@resolver');
    expect(env.getVariable('bar')?.value).toBe('value');

    await expect(
      adapter.importResolverVariables(directive, {}, env, '@resolver')
    ).rejects.toThrow("Export 'foo' not found in resolver '@resolver'");
  });
});
